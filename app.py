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

import asyncio
import json
import logging
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
from fastapi.responses import HTMLResponse, JSONResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
import uvicorn

from features import engineer_transaction_features
from genai import ask_financial_analyst
from ingestion import load_transactions_excel
from insights import build_cluster_insights, build_fraud_table, compute_basic_insights
from company_accountant import analyze_company_file, build_excel_report, build_pdf_report, CAReport
from preprocessing import transform_with_artifacts


app = FastAPI(title="KAVACH", version="0.1.0")
logger = logging.getLogger("kavach.api")

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
MAX_UPLOAD_BYTES = 20 * 1024 * 1024
ALLOWED_EXTENSIONS = {".xlsx", ".xls", ".csv"}
ALLOWED_CONTENT_TYPES = {
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "text/csv",
    "application/csv",
    "application/octet-stream",
}


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
        self.dashboard_payload: Dict[str, Any] | None = None
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


class AskAIRequest(BaseModel):
    question: str = Field(min_length=1, max_length=5000)


def _create_session_state() -> tuple[str, AppState]:
    _cleanup_expired_sessions()
    session_id = uuid.uuid4().hex
    s = AppState()
    SESSION_STORE[session_id] = s
    SESSION_LAST_ACCESS[session_id] = time.time()
    return session_id, s


def _cleanup_expired_sessions() -> None:
    now = time.time()
    expired = [
        sid
        for sid, last_access in SESSION_LAST_ACCESS.items()
        if (now - last_access) > SESSION_TTL_SECONDS
    ]
    for sid in expired:
        SESSION_LAST_ACCESS.pop(sid, None)
        SESSION_STORE.pop(sid, None)


def _validate_upload(file: UploadFile, contents: bytes) -> str:
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing filename.")
    suffix = Path(file.filename).suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="Unsupported file type. Allowed: .xlsx, .xls, .csv.",
        )
    if len(contents) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Limit is {MAX_UPLOAD_BYTES // (1024 * 1024)}MB.",
        )
    content_type = (file.content_type or "").lower().strip()
    if content_type and content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Unsupported content type for uploaded statement.",
        )
    return suffix


def _get_state_for_request(request: Request) -> AppState:
    _cleanup_expired_sessions()
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


@app.middleware("http")
async def request_logging_middleware(request: Request, call_next):
    start = time.perf_counter()
    request_id = uuid.uuid4().hex[:12]
    try:
        response = await call_next(request)
    except Exception:
        duration_ms = (time.perf_counter() - start) * 1000
        logger.exception(
            "request_failed request_id=%s method=%s path=%s duration_ms=%.2f",
            request_id,
            request.method,
            request.url.path,
            duration_ms,
        )
        raise
    duration_ms = (time.perf_counter() - start) * 1000
    response.headers["X-Request-Id"] = request_id
    logger.info(
        "request_complete request_id=%s method=%s path=%s status=%s duration_ms=%.2f",
        request_id,
        request.method,
        request.url.path,
        response.status_code,
        duration_ms,
    )
    return response


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
        # Fall back to a deterministic rule score when no model is available.
        df["model_raw_score"] = 0.0
        df["fraud_score"] = df["rule_based_fraud_flag"].astype(float)
        df["model_fraud_flag"] = df["rule_based_fraud_flag"].astype(bool)
        return df

    artifacts = model_bundle["preprocessing"]
    engineered_cols = model_bundle["engineered_feature_names"]
    clf = model_bundle["classifier"]
    threshold = float(model_bundle.get("classification_threshold", 0.6))

    # I transform with the fitted preprocessing artifacts from training.
    X_num = transform_with_artifacts(df, artifacts)
    engineered_subset = df.reindex(columns=engineered_cols).fillna(0.0).astype(float)
    X_full = np.hstack([X_num.values, engineered_subset.values])

    scores = clf.predict_proba(X_full)
    model_scores = scores[:, 1] if scores.shape[1] > 1 else np.zeros(len(df), dtype=float)
    velocity_component = (
        df["velocity_flag"].astype(float)
        if "velocity_flag" in df.columns
        else pd.Series(0.0, index=df.index)
    )
    country_component = (
        df["country_changed"].astype(float)
        if "country_changed" in df.columns
        else pd.Series(0.0, index=df.index)
    )
    rule_scores = (
        df["rule_based_fraud_flag"].astype(float) * 0.55
        + velocity_component * 0.15
        + country_component * 0.15
    ).clip(0.0, 1.0)
    blended_scores = (0.75 * model_scores + 0.25 * rule_scores).clip(0.0, 1.0)
    df["model_raw_score"] = model_scores
    df["fraud_score"] = blended_scores
    df["model_fraud_flag"] = model_scores >= threshold

    return df


def _build_dashboard_payload(s: AppState) -> Dict[str, Any]:
    if s.df_with_features is None or s.insights is None:
        raise ValueError("No dashboard state available.")

    df = s.df_with_features
    cat_group = df.groupby("category")["amount"].sum().reset_index()
    category_chart = {
        "labels": cat_group["category"].astype(str).tolist(),
        "values": cat_group["amount"].astype(float).tolist(),
    }
    monthly = s.insights.get("monthly_trends", [])

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
    tx_records: list[Dict[str, Any]] = []
    df_tx = df.copy()
    if "id" not in df_tx.columns:
        df_tx["id"] = np.arange(len(df_tx))
    for _, row in df_tx[tx_columns].head(2000).iterrows():
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

    return {
        "insights": s.insights,
        "category_chart": category_chart,
        "monthly_trends": monthly,
        "transactions": tx_records,
        "fraud_table": s.fraud_table or [],
        "cluster_insights": s.cluster_insights or [],
        "user_profile": s.user_profile or {},
        "sample_rows": s.sample_rows or [],
    }


@app.on_event("startup")
def on_startup() -> None:
    """
    When the app starts, I try to load an existing model bundle and
    also make sure the directory structure exists.
    """
    # Here I also load a local .env file so that deployments can keep
    # secrets like GROQ_API_KEY outside of the codebase.
    load_dotenv()
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )

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
    session_id, session_state = _create_session_state()
    contents = await file.read()
    suffix = _validate_upload(file, contents)
    tmp_path = DATA_DIR / f"uploaded_transactions_{session_id}{suffix}"
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
    session_state.dashboard_payload = _build_dashboard_payload(session_state)

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
    state.dashboard_payload = session_state.dashboard_payload

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
async def dashboard_data(request: Request, recover: bool = False) -> JSONResponse:
    """
    Here I expose the latest analytics snapshot as JSON so that the
    frontend can render charts and tables with Chart.js.
    """
    s = _get_state_for_request(request)
    if s.dashboard_payload is not None:
        return JSONResponse(s.dashboard_payload)

    if s.df_with_features is None or s.insights is None:
        # Attempt to rehydrate from the last uploaded file on disk.
        uploaded_path = s.last_upload_path or None
        if uploaded_path is None and recover:
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
                s.dashboard_payload = _build_dashboard_payload(s)
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
                s.dashboard_payload = _build_dashboard_payload(s)
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
    s.dashboard_payload = _build_dashboard_payload(s)
    return JSONResponse(s.dashboard_payload)


@app.post("/company_upload")
async def company_upload(file: UploadFile = File(...)) -> JSONResponse:
    session_id, session_state = _create_session_state()
    contents = await file.read()
    suffix = _validate_upload(file, contents)
    tmp_path = DATA_DIR / f"company_upload_{session_id}{suffix}"
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
    payload["generated_at"] = pd.Timestamp.utcnow().isoformat()
    return JSONResponse(payload)


@app.get("/api/v1/company_report")
async def company_report_v1(request: Request) -> JSONResponse:
    payload = await company_report(request)
    data = json.loads(payload.body.decode("utf-8"))
    return JSONResponse({"status": "ok", "data": data})


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
async def ask_ai(request: Request, payload: AskAIRequest) -> JSONResponse:
    """
    This endpoint takes a user question from the dashboard and routes
    it through the KAVACH‑powered financial analyst defined in `genai.py`.
    """
    question = payload.question.strip()
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


@app.get("/model_info")
async def model_info() -> JSONResponse:
    if MODEL_BUNDLE is None:
        return JSONResponse({"available": False, "message": "No trained model bundle loaded."})

    feature_names = MODEL_BUNDLE.get("feature_names", [])
    importances = MODEL_BUNDLE.get("feature_importances", [])
    pairs = []
    for idx, name in enumerate(feature_names):
        if idx >= len(importances):
            break
        pairs.append({"feature": str(name), "importance": float(importances[idx])})
    pairs.sort(key=lambda x: x["importance"], reverse=True)

    return JSONResponse(
        {
            "available": True,
            "threshold": float(MODEL_BUNDLE.get("classification_threshold", 0.6)),
            "top_features": pairs[:20],
            "metrics": MODEL_BUNDLE.get("metrics", {}),
        }
    )


@app.get("/api/v1/dashboard_data")
async def dashboard_data_v1(request: Request) -> JSONResponse:
    payload = await dashboard_data(request)
    data = json.loads(payload.body.decode("utf-8"))
    return JSONResponse({"status": "ok", "data": data})


@app.get("/explain_transaction/{tx_id}")
async def explain_transaction(tx_id: int, request: Request) -> JSONResponse:
    s = _get_state_for_request(request)
    if s.df_with_features is None:
        raise HTTPException(status_code=400, detail="Please upload and analyze a file first.")

    df = s.df_with_features.copy()
    if "id" not in df.columns:
        df["id"] = np.arange(len(df))
    row = df[df["id"] == tx_id]
    if row.empty:
        raise HTTPException(status_code=404, detail=f"Transaction '{tx_id}' not found.")

    tx = row.iloc[0]
    model_info_payload = await model_info()
    model_info_data = json.loads(model_info_payload.body.decode("utf-8"))
    top_features = model_info_data.get("top_features", [])[:8] if model_info_data.get("available") else []

    return JSONResponse(
        {
            "transaction_id": int(tx_id),
            "user_id": str(tx.get("user_id", "")),
            "amount": float(tx.get("amount", 0.0)),
            "country": str(tx.get("country", "")),
            "category": str(tx.get("category", "")),
            "fraud_score": float(tx.get("fraud_score", 0.0)),
            "rule_based_fraud_flag": bool(tx.get("rule_based_fraud_flag", False)),
            "model_fraud_flag": bool(tx.get("model_fraud_flag", False)),
            "top_model_drivers": top_features,
        }
    )


@app.get("/stream/dashboard")
async def stream_dashboard(request: Request) -> StreamingResponse:
    async def event_gen():
        while True:
            if await request.is_disconnected():
                break
            s = _get_state_for_request(request)
            payload = {
                "ts": time.time(),
                "has_data": bool(s.df_with_features is not None),
                "total_transactions": int(len(s.df_with_features)) if s.df_with_features is not None else 0,
                "flagged_transactions": int(len(s.fraud_table or [])),
            }
            yield f"data: {json.dumps(payload)}\n\n"
            await asyncio.sleep(2.0)

    return StreamingResponse(event_gen(), media_type="text/event-stream")


if __name__ == "__main__":
    # I run Uvicorn in a simple development configuration so that the
    # whole platform starts with a single Python command.
    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=8000,
        reload=False,
    )
