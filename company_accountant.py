"""
Company-focused Chartered Accountant (CA) analysis module.

This module ingests company financial spreadsheets, validates schema,
detects anomalies with ML + rule checks, computes summaries, and
generates charts plus report artifacts.
"""

from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
from typing import Dict, List, Tuple

import base64
import tempfile

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler


COLUMN_ALIASES = {
    "date": ["date", "txn_date", "transaction_date", "posted_date", "time", "timestamp"],
    "amount": ["amount", "value", "amt", "transaction_amount", "debit", "credit", "net_amount"],
    "category": ["category", "type", "expense_type", "revenue_type", "particulars", "description"],
    "vendor": ["vendor", "merchant", "supplier", "payee", "party"],
    "customer": ["customer", "client", "payer", "party"],
}


@dataclass
class CAReport:
    summary: Dict[str, float]
    monthly_trends: List[Dict[str, float]]
    category_totals: List[Dict[str, float]]
    anomalies: List[Dict[str, str]]
    charts: Dict[str, str]
    verified: bool


def _normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    lower = [str(c).strip().lower() for c in df.columns]
    # make unique
    seen = {}
    unique = []
    for name in lower:
        if name not in seen:
            seen[name] = 0
            unique.append(name)
        else:
            seen[name] += 1
            unique.append(f"{name}_{seen[name]}")
    df.columns = unique

    mapped: Dict[str, str] = {}
    for canonical, variants in COLUMN_ALIASES.items():
        for v in variants:
            if v in df.columns:
                mapped[canonical] = v
                break

    # Handle debit/credit columns
    if "debit" in df.columns and "credit" in df.columns:
        df["amount"] = pd.to_numeric(df["credit"], errors="coerce").fillna(0) - pd.to_numeric(
            df["debit"], errors="coerce"
        ).fillna(0)
        mapped["amount"] = "amount"
    elif "debit" in df.columns and "amount" not in df.columns:
        df["amount"] = -pd.to_numeric(df["debit"], errors="coerce")
        mapped["amount"] = "amount"
    elif "credit" in df.columns and "amount" not in df.columns:
        df["amount"] = pd.to_numeric(df["credit"], errors="coerce")
        mapped["amount"] = "amount"

    for canonical, src in mapped.items():
        if canonical != src:
            df[canonical] = df[src]

    return df


def _infer_columns(df: pd.DataFrame) -> pd.DataFrame:
    """
    Infer date/amount/category columns if not explicitly present.
    This keeps the module flexible for arbitrary financial spreadsheets.
    """
    df = df.copy()

    # Date inference
    if "date" not in df.columns:
        date_candidates = [c for c in df.columns if "date" in c or "time" in c or "period" in c or "month" in c]
        for c in date_candidates:
            parsed = pd.to_datetime(df[c], errors="coerce")
            if parsed.notna().mean() > 0.6:
                df["date"] = parsed
                break

    # Amount inference: pick numeric column with highest variance
    if "amount" not in df.columns:
        numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
        if not numeric_cols:
            # Try coercing object columns to numeric
            numeric_cols = []
            for c in df.columns:
                coerced = pd.to_numeric(
                    df[c].astype(str)
                    .str.replace(",", "", regex=False)
                    .str.replace("(", "-", regex=False)
                    .str.replace(")", "", regex=False)
                    .str.replace("₹", "", regex=False)
                    .str.replace("$", "", regex=False)
                    .str.replace("€", "", regex=False)
                    .str.replace("£", "", regex=False),
                    errors="coerce",
                )
                if coerced.notna().mean() > 0.6:
                    df[c] = coerced
                    numeric_cols.append(c)
        if numeric_cols:
            variances = {c: df[c].var(skipna=True) for c in numeric_cols}
            best = max(variances, key=lambda k: variances[k] if pd.notna(variances[k]) else -1)
            df["amount"] = pd.to_numeric(df[best], errors="coerce")

    # Category inference: pick low-cardinality text column
    if "category" not in df.columns:
        text_cols = df.select_dtypes(include=["object"]).columns.tolist()
        if text_cols:
            counts = {c: df[c].nunique(dropna=True) for c in text_cols}
            best = min(counts, key=lambda k: counts[k] if counts[k] > 0 else 1e9)
            df["category"] = df[best].fillna("Uncategorized")

    # Fallbacks to keep pipeline resilient
    if "date" not in df.columns:
        df["date"] = pd.to_datetime(pd.Timestamp.today()) + pd.to_timedelta(np.arange(len(df)), unit="D")
    if "amount" not in df.columns:
        df["amount"] = 0.0
    if "category" not in df.columns:
        df["category"] = "Uncategorized"

    return df


def _prepare_frame(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    if "date" in df.columns:
        df["date"] = pd.to_datetime(df["date"], errors="coerce")
    if "amount" in df.columns:
        df["amount"] = pd.to_numeric(
            df["amount"]
            .astype(str)
            .str.replace(",", "", regex=False)
            .str.replace("(", "-", regex=False)
            .str.replace(")", "", regex=False)
            .str.replace("₹", "", regex=False)
            .str.replace("$", "", regex=False)
            .str.replace("€", "", regex=False)
            .str.replace("£", "", regex=False),
            errors="coerce",
        )
        df["amount"] = df["amount"].fillna(0.0)
    return df


def _compute_summary(df: pd.DataFrame) -> Dict[str, float]:
    if "amount" not in df.columns:
        return {"revenue": 0.0, "expenses": 0.0, "profit": 0.0}
    revenue = df.loc[df["amount"] > 0, "amount"].sum()
    expenses = df.loc[df["amount"] < 0, "amount"].abs().sum()
    profit = revenue - expenses
    return {
        "revenue": float(revenue),
        "expenses": float(expenses),
        "profit": float(profit),
    }


def _monthly_trends(df: pd.DataFrame) -> List[Dict[str, float]]:
    if "date" not in df.columns or "amount" not in df.columns:
        return []
    monthly = (
        df.dropna(subset=["date"])
        .set_index("date")
        .resample("ME")
        .agg(revenue=("amount", lambda s: s[s > 0].sum()), expenses=("amount", lambda s: s[s < 0].abs().sum()))
    )
    return [
        {"month": idx.strftime("%Y-%m"), "revenue": float(row.revenue), "expenses": float(row.expenses)}
        for idx, row in monthly.iterrows()
    ]


def _category_totals(df: pd.DataFrame) -> List[Dict[str, float]]:
    if "category" not in df.columns or "amount" not in df.columns:
        return []
    cat = df.groupby("category")["amount"].sum().sort_values(ascending=False)
    return [
        {"category": str(cat_name), "total": float(val)}
        for cat_name, val in cat.items()
    ]


def _detect_anomalies(df: pd.DataFrame) -> List[Dict[str, str]]:
    anomalies: List[Dict[str, str]] = []
    df = df.copy()
    df["row_number"] = np.arange(len(df)) + 2  # 1-based with header row

    # Rule-based checks
    for _, row in df.iterrows():
        row_id = str(row.row_number) if pd.notna(row.row_number) else "N/A"
        if "date" in df.columns and pd.isna(row.get("date")):
            anomalies.append({
                "row": str(row_id),
                "field": "date",
                "issue": "Invalid or missing date",
                "suggestion": "Provide a valid date",
            })
        if "amount" in df.columns and pd.isna(row.get("amount")):
            anomalies.append({
                "row": str(row_id),
                "field": "amount",
                "issue": "Missing amount",
                "suggestion": "Provide a numeric amount",
            })
        if "category" in df.columns and (pd.isna(row.get("category")) or str(row.get("category")).strip() == ""):
            anomalies.append({
                "row": str(row_id),
                "field": "category",
                "issue": "Missing category",
                "suggestion": "Assign a category",
            })

    # ML anomaly detection on numeric features
    if "amount" not in df.columns:
        return anomalies

    features = df[["amount"]].copy()
    if "date" in df.columns:
        features["day"] = df["date"].dt.day.fillna(0)
        features["month"] = df["date"].dt.month.fillna(0)
    features = features.fillna(0)

    if len(features) >= 10:
        scaler = StandardScaler()
        X = scaler.fit_transform(features.values)
        model = IsolationForest(n_estimators=200, contamination=0.03, random_state=42)
        preds = model.fit_predict(X)
        df["ml_anomaly"] = preds == -1
        for _, row in df[df["ml_anomaly"]].iterrows():
            row_id = str(row.row_number) if pd.notna(row.row_number) else "N/A"
            anomalies.append({
                "row": str(row_id),
                "field": "amount",
                "issue": "Unusual transaction detected",
                "suggestion": "Verify amount/category/vendor",
            })

    return anomalies


def _plot_to_base64(fig) -> str:
    buf = BytesIO()
    fig.savefig(buf, format="png", dpi=140, bbox_inches="tight")
    buf.seek(0)
    return base64.b64encode(buf.read()).decode("utf-8")


def _build_charts(df: pd.DataFrame) -> Dict[str, str]:
    import matplotlib.pyplot as plt

    charts = {}

    # Revenue vs Expense trend
    monthly = _monthly_trends(df)
    if monthly:
        months = [m["month"] for m in monthly]
        revenues = [m["revenue"] for m in monthly]
        expenses = [m["expenses"] for m in monthly]
        fig, ax = plt.subplots(figsize=(6, 3.2))
        ax.plot(months, revenues, label="Revenue", color="#22c55e")
        ax.plot(months, expenses, label="Expenses", color="#f43f5e")
        ax.set_title("Revenue vs Expense")
        ax.tick_params(axis="x", rotation=45)
        ax.legend()
        charts["trend"] = _plot_to_base64(fig)
        plt.close(fig)

    # Pie chart of top expense categories
    if "amount" in df.columns and "category" in df.columns:
        cat = df.copy()
        cat["expense"] = cat["amount"].where(cat["amount"] < 0, 0).abs()
        top = cat.groupby("category")["expense"].sum().sort_values(ascending=False).head(6)
        if not top.empty:
            fig, ax = plt.subplots(figsize=(4.2, 4.2))
            ax.pie(top.values, labels=top.index.astype(str), autopct="%1.1f%%")
            ax.set_title("Top Expense Categories")
            charts["expenses_pie"] = _plot_to_base64(fig)
            plt.close(fig)

    # Scatter plot anomalies
    if "amount" in df.columns:
        fig, ax = plt.subplots(figsize=(6, 3.2))
        ax.scatter(df.index, df["amount"], alpha=0.6, color="#38bdf8")
        ax.set_title("Transaction Amounts")
        charts["anomalies"] = _plot_to_base64(fig)
        plt.close(fig)

    return charts


def _load_company_file(path: str) -> pd.DataFrame:
    if str(path).lower().endswith((".xlsx", ".xls")):
        try:
            xls = pd.ExcelFile(path)
            sheets = []
            for sheet in xls.sheet_names:
                df_sheet = xls.parse(sheet)
                sheets.append((sheet, df_sheet))
            # choose sheet with most non-null cells
            best = max(sheets, key=lambda s: s[1].notna().sum().sum())
            return best[1]
        except Exception:
            try:
                return pd.read_excel(path, engine="openpyxl")
            except Exception:
                return pd.DataFrame()
    try:
        return pd.read_csv(path)
    except Exception:
        try:
            return pd.read_csv(path, sep=None, engine="python")
        except Exception:
            return pd.DataFrame()


def analyze_company_file(path: str) -> Tuple[pd.DataFrame, CAReport]:
    df_raw = _load_company_file(path)
    if df_raw is None or df_raw.empty:
        df_raw = pd.DataFrame()
    df = _normalize_columns(df_raw)
    df = _infer_columns(df)
    df = _prepare_frame(df)

    summary = _compute_summary(df)
    monthly = _monthly_trends(df)
    category_totals = _category_totals(df)
    anomalies = _detect_anomalies(df)
    charts = _build_charts(df)
    verified = len(anomalies) == 0

    report = CAReport(
        summary=summary,
        monthly_trends=monthly,
        category_totals=category_totals,
        anomalies=anomalies,
        charts=charts,
        verified=verified,
    )
    return df, report


def build_excel_report(df: pd.DataFrame, report: CAReport, verified_only: bool) -> bytes:
    if verified_only and not report.verified:
        raise ValueError("Cannot download verified report while anomalies exist.")

    output = BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Transactions")
        pd.DataFrame([report.summary]).to_excel(writer, index=False, sheet_name="Summary")
        pd.DataFrame(report.anomalies).to_excel(writer, index=False, sheet_name="Anomalies")
    return output.getvalue()


def build_pdf_report(report: CAReport) -> bytes:
    from fpdf import FPDF

    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 10, "KAVACH Company Verification Report", ln=1)
    pdf.set_font("Helvetica", size=11)
    pdf.cell(0, 8, "Verified by Kavach" if report.verified else "Issues detected", ln=1)

    pdf.ln(4)
    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 8, "Summary", ln=1)
    pdf.set_font("Helvetica", size=10)
    for k, v in report.summary.items():
        pdf.cell(0, 6, f"{k.title()}: {v:,.2f}", ln=1)

    # Charts
    for title, img_b64 in report.charts.items():
        pdf.ln(4)
        pdf.set_font("Helvetica", "B", 11)
        pdf.cell(0, 7, title.replace("_", " ").title(), ln=1)
        with tempfile.NamedTemporaryFile(suffix=".png") as tmp:
            tmp.write(base64.b64decode(img_b64))
            tmp.flush()
            pdf.image(tmp.name, w=170)

    return pdf.output(dest="S").encode("latin1")


__all__ = [
    "analyze_company_file",
    "build_excel_report",
    "build_pdf_report",
    "CAReport",
]
