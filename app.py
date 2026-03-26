"""
In this file, I wire everything together into a single FastAPI
application that exposes KAVACH as a local, end‑to‑end demo.

I keep the architecture intentionally simple:
- `POST /upload` accepts an Excel file, runs the analytics pipeline,
  and caches the results in memory.
- `GET /dashboard` serves the dashboard HTML.
- `GET /dashboard_data` exposes the aggregated insights and tables.
- `POST /ask_ai` lets the frontend query the KAVACH‑powered assistant.

The whole system runs locally via:
    python app.py
"""

from __future__ import annotations

import json
from pathlib import Path
import time
import uuid
from typing import Any, Dict

import joblib
import numpy as np
import pandas as pd
from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from starlette.responses import RedirectResponse
import uvicorn

from features import engineer_transaction_features
from genai import ask_financial_analyst
from ingestion import load_transactions_excel
from insights import build_cluster_insights, build_fraud_table, compute_basic_insights
from company_accountant import analyze_company_file, build_excel_report, build_pdf_report, CAReport
from preprocessing import transform_with_artifacts


app = FastAPI(title="KAVACH", version="0.1.0")

# I allow the frontend JS to talk to the backend without CORS issues.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = BASE_DIR / "frontend"
DATA_DIR = BASE_DIR / "data"
MODEL_PATH = BASE_DIR / "model.pkl"


class AppState:
    """
    I use this simple container to keep the latest session data around
    while the process is running. For a single‑user local demo, this
    is more than enough and keeps things easy to reason about.
    """

    def __init__(self) -> None:
        self.raw_df: pd.DataFrame | None = None
        self.df_with_features: pd.DataFrame | None = None
        self.insights: Dict[str, Any] | None = None
        self.fraud_table: list[Dict[str, Any]] | None = None
        self.cluster_insights: list[Dict[str, Any]] | None = None
        self.model_bundle: Dict[str, Any] | None = None
        self.user_profile: Dict[str, Any] | None = None
        self.sample_rows: list[Dict[str, Any]] | None = None
        self.last_upload_path: Path | None = None
        self.ca_df: pd.DataFrame | None = None
        self.ca_report: Dict[str, Any] | None = None
        self.ca_last_upload_path: Path | None = None


state = AppState()

# ----------------------------
# Session state (multi-upload safe)
# ----------------------------
SESSION_COOKIE_NAME = "kavach_session"
SESSION_TTL_SECONDS = 60 * 60  # 1 hour
SESSION_STORE: dict[str, AppState] = {}
SESSION_LAST_ACCESS: dict[str, float] = {}

# I keep the model bundle global because it is immutable and shared.
MODEL_BUNDLE: Dict[str, Any] | None = None


def _create_session_state() -> tuple[str, AppState]:
    session_id = uuid.uuid4().hex
    s = AppState()
    SESSION_STORE[session_id] = s
    SESSION_LAST_ACCESS[session_id] = time.time()
    return session_id, s


def _get_state_for_request(request: Request) -> AppState:
    session_id = request.cookies.get(SESSION_COOKIE_NAME)
    if not session_id:
        # Backwards compatible fallback for older frontends.
        return state

    now = time.time()
    last = SESSION_LAST_ACCESS.get(session_id)
    if last is None or (now - last) > SESSION_TTL_SECONDS:
        SESSION_STORE.pop(session_id, None)
        SESSION_LAST_ACCESS.pop(session_id, None)
        _, s = _create_session_state()
        return s

    SESSION_LAST_ACCESS[session_id] = now
    return SESSION_STORE.get(session_id) or state


def _rehydrate_company_state_if_needed(s: AppState) -> None:
    if s.ca_report is not None and s.ca_df is not None:
        return

    uploaded_path = s.ca_last_upload_path
    if uploaded_path is None:
        candidates: list[Path] = []
        for ext in (".xlsx", ".xls", ".csv"):
            candidates.extend(DATA_DIR.glob(f"company_upload_*{ext}"))
        # Also include legacy/non-session filenames if present.
        for base in (
            DATA_DIR / "company_upload.xlsx",
            DATA_DIR / "company_upload.xls",
            DATA_DIR / "company_upload.csv",
        ):
            if base.exists():
                candidates.append(base)
        if candidates:
            uploaded_path = max(candidates, key=lambda p: p.stat().st_mtime)

    if uploaded_path is None or not uploaded_path.exists():
        return

    df, report = analyze_company_file(uploaded_path)
    s.ca_df = df
    s.ca_report = {
        "summary": report.summary,
        "monthly_trends": report.monthly_trends,
        "category_totals": report.category_totals,
        "anomalies": report.anomalies,
        "charts": report.charts,
        "verified": report.verified,
    }
    s.ca_last_upload_path = uploaded_path

# Here I expose the static frontend assets (HTML, CSS, JS) under a simple
# `/static` prefix so that the browser can fetch `style.css` and `script.js`
# directly from the `frontend/` folder.
app.mount(
    "/static",
    StaticFiles(directory=FRONTEND_DIR),
    name="static",
)


def _load_model_bundle() -> Dict[str, Any] | None:
    """
    At startup, I attempt to load an existing trained model. If the
    file is not present, I simply return None and later rely on
    rule‑based flags only.
    """
    if not MODEL_PATH.exists():
        return None
    try:
        bundle = joblib.load(MODEL_PATH)
        return bundle
    except Exception:
        return None


def _score_transactions_with_model(
    df_with_features: pd.DataFrame, model_bundle: Dict[str, Any] | None
) -> pd.DataFrame:
    """
    Given the feature‑augmented DataFrame and an optional model bundle,
    I attach a continuous fraud_score and a binary model_fraud_flag
    column. If the model is missing, I simply fall back to a naive
    score derived from the rule‑based flag.
    """
    df = df_with_features.copy()

    if model_bundle is None:
        # I fall back to a very simple heuristic score for demo purposes.
        df["fraud_score"] = df["rule_based_fraud_flag"].astype(float)
        df["model_fraud_flag"] = df["rule_based_fraud_flag"].astype(bool)
        return df

    artifacts = model_bundle["preprocessing"]
    engineered_cols = model_bundle["engineered_feature_names"]
    clf = model_bundle["classifier"]

    # I transform with the fitted preprocessing artifacts from training.
    X_num = transform_with_artifacts(df, artifacts)
    engineered_subset = df.reindex(columns=engineered_cols).fillna(0.0).astype(float)
    X_full = np.hstack([X_num.values, engineered_subset.values])

    scores = clf.predict_proba(X_full)[:, 1]
    df["fraud_score"] = scores

    # I map continuous scores to three buckets just for visualization.
    df["model_fraud_flag"] = scores > 0.6

    return df


@app.on_event("startup")
def on_startup() -> None:
    """
    When the app starts, I try to load an existing model bundle and
    also make sure the directory structure exists.
    """
    # Here I also load a local .env file so that deployments can keep
    # secrets like GROQ_API_KEY outside of the codebase.
    load_dotenv()

    DATA_DIR.mkdir(exist_ok=True)
    FRONTEND_DIR.mkdir(exist_ok=True)

    global MODEL_BUNDLE
    MODEL_BUNDLE = _load_model_bundle()
    # Keep legacy behavior working for any code path that still references `state.model_bundle`.
    state.model_bundle = MODEL_BUNDLE


@app.get("/", response_class=HTMLResponse)
async def landing_page() -> HTMLResponse:
    """
    I simply serve the static landing page from the frontend directory.
    """
    html_path = FRONTEND_DIR / "landing.html"
    if not html_path.exists():
        raise HTTPException(status_code=500, detail="I could not find landing.html.")
    return HTMLResponse(html_path.read_text(encoding="utf-8"))


@app.post("/upload")
async def upload_transactions(
    file: UploadFile = File(...),
    user_name: str = Form(""),
    user_age: str = Form(""),
    sheet_type: str = Form(""),
) -> JSONResponse:
    """
    This endpoint is the heart of the ingestion and analysis flow.
    I accept an Excel file, run it through the full analytics stack,
    and cache all intermediate results in memory for the dashboard to use.
    """
    if not file.filename.lower().endswith((".xlsx", ".xls", ".csv")):
        raise HTTPException(
            status_code=400,
            detail="I expect an Excel or CSV file with extension .xlsx, .xls, or .csv.",
        )

    session_id, session_state = _create_session_state()

    suffix = Path(file.filename).suffix.lower()
    tmp_path = DATA_DIR / f"uploaded_transactions_{session_id}{suffix}"
    contents = await file.read()
    tmp_path.write_bytes(contents)

    try:
        df_raw = load_transactions_excel(tmp_path)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    df_with_features = engineer_transaction_features(df_raw)

    # I compute insights before scoring so that both reflect the same view.
    insights = compute_basic_insights(df_with_features)

    df_scored = _score_transactions_with_model(
        df_with_features, MODEL_BUNDLE
    )
    fraud_table = build_fraud_table(df_scored)
    cluster_insights = build_cluster_insights(df_scored)

    session_state.raw_df = df_raw
    session_state.df_with_features = df_scored
    session_state.insights = insights
    session_state.fraud_table = fraud_table
    session_state.cluster_insights = cluster_insights
    session_state.user_profile = {
        "name": user_name.strip(),
        "age": user_age.strip(),
        "sheet_type": sheet_type.strip(),
    }

    sample_rows = []
    for _, row in df_raw.head(5).iterrows():
        record = {}
        for key, value in row.to_dict().items():
            if isinstance(value, pd.Timestamp):
                record[key] = value.isoformat()
            elif hasattr(value, "item"):
                record[key] = value.item()
            else:
                record[key] = value
        sample_rows.append(record)
    session_state.sample_rows = sample_rows
    session_state.last_upload_path = tmp_path

    # Backwards-compatible legacy behavior (single global session).
    # This keeps existing clients working even if cookies aren't persisted.
    state.raw_df = df_raw
    state.df_with_features = df_scored
    state.insights = insights
    state.fraud_table = fraud_table
    state.cluster_insights = cluster_insights
    state.user_profile = session_state.user_profile
    state.sample_rows = sample_rows
    state.last_upload_path = tmp_path

    response = JSONResponse({"status": "ok"})
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=session_id,
        httponly=True,
        samesite="lax",
        max_age=SESSION_TTL_SECONDS,
    )
    return response


@app.get("/dashboard", response_class=HTMLResponse)
async def dashboard_page() -> HTMLResponse:
    """
    Once the user has uploaded data, they land on this dashboard.
    I render a static HTML shell that then pulls live data via JS.
    """
    html_path = FRONTEND_DIR / "dashboard.html"
    if not html_path.exists():
        raise HTTPException(status_code=500, detail="I could not find dashboard.html.")
    return HTMLResponse(html_path.read_text(encoding="utf-8"))


@app.get("/company_accountant", response_class=HTMLResponse)
async def company_accountant_page() -> HTMLResponse:
    html_path = FRONTEND_DIR / "company_accountant.html"
    if not html_path.exists():
        raise HTTPException(status_code=500, detail="I could not find company_accountant.html.")
    return HTMLResponse(html_path.read_text(encoding="utf-8"))


@app.get("/dashboard_data")
async def dashboard_data(request: Request) -> JSONResponse:
    """
    Here I expose the latest analytics snapshot as JSON so that the
    frontend can render charts and tables with Chart.js.
    """
    s = _get_state_for_request(request)

    if s.df_with_features is None or s.insights is None:
        # Attempt to rehydrate from the last uploaded file on disk.
        uploaded_path = s.last_upload_path or None
        if uploaded_path is None:
            candidates: list[Path] = []
            for ext in (".xlsx", ".xls", ".csv"):
                candidates.extend(DATA_DIR.glob(f"uploaded_transactions_*{ext}"))
            # Also include legacy/non-session filenames if present.
            for base in (
                DATA_DIR / "uploaded_transactions.xlsx",
                DATA_DIR / "uploaded_transactions.xls",
                DATA_DIR / "uploaded_transactions.csv",
            ):
                if base.exists():
                    candidates.append(base)
            if candidates:
                uploaded_path = max(candidates, key=lambda p: p.stat().st_mtime)
        if uploaded_path is not None and uploaded_path.exists():
            try:
                df_raw = load_transactions_excel(uploaded_path)
                df_with_features = engineer_transaction_features(df_raw)
                insights = compute_basic_insights(df_with_features)
                df_scored = _score_transactions_with_model(
                    df_with_features, MODEL_BUNDLE
                )
                fraud_table = build_fraud_table(df_scored)
                cluster_insights = build_cluster_insights(df_scored)
                s.raw_df = df_raw
                s.df_with_features = df_scored
                s.insights = insights
                s.fraud_table = fraud_table
                s.cluster_insights = cluster_insights
                if s.sample_rows is None:
                    sample_rows = []
                    for _, row in df_raw.head(5).iterrows():
                        record = {}
                        for key, value in row.to_dict().items():
                            if isinstance(value, pd.Timestamp):
                                record[key] = value.isoformat()
                            elif hasattr(value, "item"):
                                record[key] = value.item()
                            else:
                                record[key] = value
                        sample_rows.append(record)
                    s.sample_rows = sample_rows
            except Exception:
                raise HTTPException(
                    status_code=400,
                    detail="I have not analyzed any transactions yet. Please upload a file.",
                )
        else:
            raise HTTPException(
                status_code=400,
                detail="I have not analyzed any transactions yet. Please upload a file.",
            )

    # I prepare spending by category for the pie chart.
    df = s.df_with_features
    cat_group = df.groupby("category")["amount"].sum().reset_index()
    category_chart = {
        "labels": cat_group["category"].astype(str).tolist(),
        "values": cat_group["amount"].astype(float).tolist(),
    }

    # I prepare monthly trend data.
    monthly = s.insights.get("monthly_trends", [])

    # I also expose a trimmed transaction table for display.
    tx_columns = [
        "id",
        "user_id",
        "timestamp",
        "amount",
        "category",
        "merchant",
        "country",
        "fraud_score",
        "rule_based_fraud_flag",
        "model_fraud_flag",
        "velocity_flag",
    ]
    tx_records = []
    df_tx = df.copy()
    if "id" not in df_tx.columns:
        df_tx["id"] = np.arange(len(df_tx))
    for _, row in df_tx[tx_columns].head(200).iterrows():
        rec = {k: row[k] for k in tx_columns if k in row}
        if isinstance(rec.get("timestamp"), pd.Timestamp):
            rec["timestamp"] = rec["timestamp"].isoformat()
        rec["amount"] = float(rec["amount"])
        if rec.get("fraud_score") is not None:
            rec["fraud_score"] = float(rec["fraud_score"])
        rec["rule_based_fraud_flag"] = bool(rec["rule_based_fraud_flag"])
        rec["model_fraud_flag"] = bool(rec["model_fraud_flag"])
        if "velocity_flag" in rec:
            rec["velocity_flag"] = bool(rec["velocity_flag"])
        tx_records.append(rec)

    return JSONResponse(
        {
            "insights": s.insights,
            "category_chart": category_chart,
            "monthly_trends": monthly,
            "transactions": tx_records,
            "fraud_table": s.fraud_table or [],
            "cluster_insights": s.cluster_insights or [],
            "user_profile": s.user_profile or {},
            "sample_rows": s.sample_rows or [],
        }
    )


@app.post("/company_upload")
async def company_upload(file: UploadFile = File(...)) -> JSONResponse:
    if not file.filename.lower().endswith((".xlsx", ".xls", ".csv")):
        raise HTTPException(status_code=400, detail="Please upload an Excel or CSV file.")

    session_id, session_state = _create_session_state()

    suffix = Path(file.filename).suffix.lower()
    tmp_path = DATA_DIR / f"company_upload_{session_id}{suffix}"
    contents = await file.read()
    tmp_path.write_bytes(contents)

    try:
        df, report = analyze_company_file(tmp_path)
    except Exception as exc:
        session_state.ca_df = None
        session_state.ca_report = None
        session_state.ca_last_upload_path = None
        state.ca_df = None
        state.ca_report = None
        state.ca_last_upload_path = None
        raise HTTPException(status_code=400, detail=str(exc))

    session_state.ca_df = df
    session_state.ca_report = {
        "summary": report.summary,
        "monthly_trends": report.monthly_trends,
        "category_totals": report.category_totals,
        "anomalies": report.anomalies,
        "charts": report.charts,
        "verified": report.verified,
    }
    session_state.ca_last_upload_path = tmp_path

    # Backwards-compatible legacy behavior (single global session).
    state.ca_df = df
    state.ca_report = session_state.ca_report
    state.ca_last_upload_path = tmp_path

    response = JSONResponse({"status": "ok"})
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=session_id,
        httponly=True,
        samesite="lax",
        max_age=SESSION_TTL_SECONDS,
    )
    return response


@app.get("/company_report")
async def company_report(request: Request) -> JSONResponse:
    s = _get_state_for_request(request)
    _rehydrate_company_state_if_needed(s)
    if s.ca_report is None:
        raise HTTPException(status_code=400, detail="Please upload a company file first.")
    payload = dict(s.ca_report)
    payload["build"] = "verify-v2"
    return JSONResponse(payload)


@app.get("/company_report_excel")
async def company_report_excel(
    request: Request, verified: bool = False
) -> Response:
    s = _get_state_for_request(request)
    _rehydrate_company_state_if_needed(s)
    if s.ca_df is None or s.ca_report is None:
        raise HTTPException(status_code=400, detail="Please upload a company file first.")
    try:
        report_obj = CAReport(
            summary=s.ca_report["summary"],
            monthly_trends=s.ca_report["monthly_trends"],
            category_totals=s.ca_report["category_totals"],
            anomalies=s.ca_report["anomalies"],
            charts=s.ca_report["charts"],
            verified=s.ca_report["verified"],
        )
        content = build_excel_report(s.ca_df, report_obj, verified_only=verified)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=kavach-company-report.xlsx"},
    )


@app.get("/company_report_pdf")
async def company_report_pdf(request: Request) -> Response:
    s = _get_state_for_request(request)
    _rehydrate_company_state_if_needed(s)
    if s.ca_report is None:
        raise HTTPException(status_code=400, detail="Please upload a company file first.")
    report_obj = CAReport(
        summary=s.ca_report["summary"],
        monthly_trends=s.ca_report["monthly_trends"],
        category_totals=s.ca_report["category_totals"],
        anomalies=s.ca_report["anomalies"],
        charts=s.ca_report["charts"],
        verified=s.ca_report["verified"],
    )
    # Always generate a PDF (verified or review-required). The Excel export
    # keeps the stricter "verified-only" behavior for compliance workflows.
    content = build_pdf_report(report_obj, verified_only=False)
    return Response(
        content=content,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=kavach-company-report.pdf"},
    )


@app.post("/ask_ai")
async def ask_ai(request: Request, payload: Dict[str, Any]) -> JSONResponse:
    """
    This endpoint takes a user question from the dashboard and routes
    it through the KAVACH‑powered financial analyst defined in `genai.py`.
    """
    question = payload.get("question", "").strip()
    if not question:
        raise HTTPException(
            status_code=400, detail="I need a non‑empty question to answer."
        )
    s = _get_state_for_request(request)

    if s.insights is None or s.fraud_table is None:
        raise HTTPException(
            status_code=400,
            detail="I need analyzed data before I can answer questions. "
            "Please upload a transaction file first.",
        )

    answer = ask_financial_analyst(
        user_query=question,
        insights=s.insights,
        fraud_cases=s.fraud_table,
    )
    return JSONResponse({"answer": answer})


if __name__ == "__main__":
    # I run Uvicorn in a simple development configuration so that the
    # whole platform starts with a single Python command.
    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=8000,
        reload=False,
    )
