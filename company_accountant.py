"""
Company-focused Chartered Accountant (CA) analysis module.
Production-ready version with corrected anomaly detection and premium PDF export.
"""

from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
from typing import Dict, List, Tuple

import base64
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler

from pathlib import Path


# ----------------------------
# COLUMN MAPPING
# ----------------------------
COLUMN_ALIASES = {
    "date": ["date", "txn_date", "transaction_date"],
    "amount": ["amount", "value", "amt"],
    "category": ["category", "type", "description"],
    "vendor": ["vendor", "merchant", "supplier"],
    "customer": ["customer", "client"],
}


@dataclass
class CAReport:
    summary: Dict[str, float]
    monthly_trends: List[Dict[str, float]]
    category_totals: List[Dict[str, float]]
    anomalies: List[Dict[str, str]]
    charts: Dict[str, str]
    verified: bool


# ----------------------------
# NORMALIZE COLUMNS
# ----------------------------
def _normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df.columns = [str(c).strip().lower() for c in df.columns]

    for canonical, variants in COLUMN_ALIASES.items():
        for v in variants:
            if v in df.columns:
                df[canonical] = df[v]
                break

    return df


# ----------------------------
# PREP DATA
# ----------------------------
def _prepare_frame(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()

    # Ensure expected canonical columns exist even if the input misses them.
    if "date" in df.columns:
        df["date"] = pd.to_datetime(df["date"], errors="coerce")
    else:
        df["date"] = pd.NaT

    if "amount" in df.columns:
        df["amount"] = pd.to_numeric(
            df["amount"]
            .astype(str)
            .str.replace(",", "", regex=False)
            .str.replace("(", "-", regex=False)
            .str.replace(")", "", regex=False),
            errors="coerce",
        ).fillna(0.0)
    else:
        df["amount"] = 0.0

    if "category" in df.columns:
        df["category"] = (
            df["category"].fillna("Uncategorized").astype(str).str.strip()
        )
    else:
        df["category"] = "Uncategorized"

    return df


# ----------------------------
# SUMMARY
# ----------------------------
def _compute_summary(df: pd.DataFrame) -> Dict[str, float]:
    revenue = df[df["amount"] > 0]["amount"].sum()
    expenses = df[df["amount"] < 0]["amount"].abs().sum()
    return {
        "revenue": float(revenue),
        "expenses": float(expenses),
        "profit": float(revenue - expenses),
    }


def _monthly_trends(df: pd.DataFrame):
    monthly = (
        df.dropna(subset=["date"])
        .set_index("date")
        .resample("ME")
        .agg(
            revenue=("amount", lambda s: s[s > 0].sum()),
            expenses=("amount", lambda s: s[s < 0].abs().sum()),
        )
    )
    return [
        {"month": i.strftime("%Y-%m"), "revenue": float(r.revenue), "expenses": float(r.expenses)}
        for i, r in monthly.iterrows()
    ]


def _category_totals(df: pd.DataFrame):
    cat = df.groupby("category")["amount"].sum()
    return [{"category": k, "total": float(v)} for k, v in cat.items()]


# ----------------------------
# 🚨 FIXED ANOMALY DETECTION
# ----------------------------
def _detect_anomalies(df: pd.DataFrame) -> List[Dict[str, str]]:
    anomalies = []
    df = df.copy()
    df["row_number"] = np.arange(len(df)) + 2

    # Limit expensive per-category ML work so large spreadsheets stay fast.
    max_categories_to_process = 12

    # Basic validation
    for _, row in df.iterrows():
        if pd.isna(row["date"]):
            anomalies.append({"row": str(row.row_number), "field": "date", "issue": "Invalid date"})
        if pd.isna(row["amount"]):
            anomalies.append({"row": str(row.row_number), "field": "amount", "issue": "Missing amount"})
        if not row["category"]:
            anomalies.append({"row": str(row.row_number), "field": "category", "issue": "Missing category"})

    if len(df) < 50:
        return anomalies

    # Category-wise detection (positive and negative "amount" sides).
    # We run ML only for the largest category groups with enough observations.
    pos_sizes = (
        df[df["amount"] > 0]
        .groupby("category")
        .size()
        .sort_values(ascending=False)
    )
    neg_sizes = (
        df[df["amount"] < 0]
        .groupby("category")
        .size()
        .sort_values(ascending=False)
    )

    categories_pos = pos_sizes[pos_sizes >= 30].head(max_categories_to_process).index.tolist()
    categories_neg = neg_sizes[neg_sizes >= 30].head(max_categories_to_process).index.tolist()
    categories_to_process = list(dict.fromkeys(categories_pos + categories_neg))[:max_categories_to_process]

    for category in categories_to_process:

        cat_df = df[df["category"] == category]

        for subset in (cat_df[cat_df["amount"] > 0], cat_df[cat_df["amount"] < 0]):

            if len(subset) < 30:
                continue

            amounts = subset["amount"].values

            # IQR
            q1, q3 = np.percentile(amounts, [25, 75])
            iqr = q3 - q1
            lb, ub = q1 - 1.5 * iqr, q3 + 1.5 * iqr

            stat_flags = (amounts < lb) | (amounts > ub)

            # Optimization: since we later intersect (AND) with stat_flags,
            # skip expensive ML when there are no IQR outliers.
            if not np.any(stat_flags):
                continue

            # ML
            X = StandardScaler().fit_transform(amounts.reshape(-1, 1))
            model = IsolationForest(contamination="auto", random_state=42, n_jobs=-1)
            ml_flags = model.fit_predict(X) == -1

            final_flags = stat_flags & ml_flags

            flagged_subset = subset.loc[final_flags, ["row_number"]]
            for row_number in flagged_subset["row_number"].astype(int).tolist():
                anomalies.append(
                    {
                        "row": str(row_number),
                        "field": "amount",
                        "issue": "Unusual transaction detected",
                        "suggestion": "Verify transaction",
                    }
                )

    return anomalies


# ----------------------------
# CHARTS
# ----------------------------
def _plot_to_base64(fig):
    buf = BytesIO()
    fig.savefig(buf, format="png", dpi=120, bbox_inches="tight")
    return base64.b64encode(buf.getvalue()).decode()


def _build_charts(df):
    # Force a headless backend so chart generation works in servers/tests.
    import matplotlib
    matplotlib.use("Agg", force=True)
    import matplotlib.pyplot as plt

    charts = {}

    # Trend chart: revenue vs expenses over time (monthly).
    monthly = _monthly_trends(df)
    if monthly:
        months = [m["month"] for m in monthly]
        revenues = [m["revenue"] for m in monthly]
        expenses = [m["expenses"] for m in monthly]

        fig, ax = plt.subplots()
        ax.plot(months, revenues, marker="o", linewidth=2, label="Revenue")
        ax.plot(months, expenses, marker="o", linewidth=2, label="Expenses")
        ax.set_title("Monthly Revenue vs Expenses")
        ax.set_ylabel("Amount")
        ax.tick_params(axis="x", rotation=45)
        ax.legend()
        charts["trend"] = _plot_to_base64(fig)
        plt.close(fig)

    # Expense pie chart: top expense categories.
    expense_df = df.copy()
    expense_df = expense_df[expense_df["amount"] < 0]
    if expense_df.empty:
        fig, ax = plt.subplots()
        ax.pie([1], labels=["No expense data"], autopct="%1.1f%%", startangle=90)
        ax.set_title("Expenses by Category (Top)")
        charts["expenses_pie"] = _plot_to_base64(fig)
        plt.close(fig)
    else:
        expense_df["expense_amount"] = expense_df["amount"].abs()
        cat = (
            expense_df.groupby("category")["expense_amount"]
            .sum()
            .sort_values(ascending=False)
        )

        top_n = 8
        top = cat.head(top_n)
        remainder = cat.iloc[top_n:]
        if not remainder.empty:
            top.loc["Other"] = float(remainder.sum())

        fig, ax = plt.subplots()
        labels = top.index.astype(str).tolist()
        values = top.values.astype(float).tolist()
        ax.pie(values, labels=labels, autopct="%1.1f%%", startangle=90)
        ax.set_title("Expenses by Category (Top)")
        charts["expenses_pie"] = _plot_to_base64(fig)
        plt.close(fig)

    return charts


# ----------------------------
# MAIN ANALYSIS
# ----------------------------
def analyze_company_file(path: str | Path) -> Tuple[pd.DataFrame, CAReport]:
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"I expected the file '{path}' to exist.")

    suffix = path.suffix.lower()
    if suffix == ".csv":
        df = pd.read_csv(path)
    elif suffix in (".xlsx", ".xls"):
        # Excel uploads are supported by the UI and backend routes.
        # openpyxl is already in requirements.txt for xlsx parsing.
        df = pd.read_excel(path)
    else:
        raise ValueError(f"Unsupported company file type: '{suffix}'.")

    df = _normalize_columns(df)
    df = _prepare_frame(df)

    summary = _compute_summary(df)
    monthly = _monthly_trends(df)
    category_totals = _category_totals(df)
    anomalies = _detect_anomalies(df)
    charts = _build_charts(df)

    report = CAReport(
        summary=summary,
        monthly_trends=monthly,
        category_totals=category_totals,
        anomalies=anomalies,
        charts=charts,
        verified=len(anomalies) == 0,
    )

    return df, report


# ----------------------------
# EXPORT: EXCEL
# ----------------------------
def build_excel_report(df: pd.DataFrame, report: CAReport, verified_only: bool) -> bytes:
    if verified_only and not report.verified:
        raise ValueError("Cannot download verified report while anomalies exist.")

    output = BytesIO()

    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Transactions")
        pd.DataFrame([report.summary]).to_excel(writer, index=False, sheet_name="Summary")
        pd.DataFrame(report.anomalies).to_excel(writer, index=False, sheet_name="Anomalies")

    return output.getvalue()


# ----------------------------
# EXPORT: PREMIUM PDF
# ----------------------------
def build_pdf_report(report: CAReport, verified_only: bool = True) -> bytes:
    from fpdf import FPDF

    if verified_only and not report.verified:
        raise ValueError("Cannot generate verified PDF while anomalies exist.")

    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=20)
    pdf.add_page()

    # Header
    # Use fpdf core fonts (more portable than Arial across fpdf/fpdf2 installs).
    pdf.set_font("helvetica", "B", 18)
    pdf.cell(0, 10, "KAVACH", ln=True, align="C")

    pdf.set_font("helvetica", size=10)
    pdf.set_text_color(100, 100, 100)
    pdf.cell(0, 6, "Financial Integrity Verification Report", ln=True, align="C")

    pdf.ln(10)

    is_verified = bool(report.verified)
    # Verified/Review Badge
    if is_verified:
        pdf.set_text_color(34, 197, 94)
        badge_title = "KAVACH VERIFIED"
        subtitle = "This dataset passed all anomaly detection checks"
    else:
        pdf.set_text_color(244, 63, 94)
        badge_title = "KAVACH REVIEW REQUIRED"
        subtitle = f"{len(report.anomalies)} anomalies detected. Review recommended"

    pdf.set_font("helvetica", "B", 22)
    pdf.cell(0, 15, badge_title, ln=True, align="C")

    pdf.set_font("helvetica", size=12)
    pdf.cell(0, 8, subtitle, ln=True, align="C")

    pdf.set_text_color(0, 0, 0)
    pdf.ln(15)

    # Summary
    pdf.set_font("helvetica", "B", 14)
    pdf.cell(0, 10, "Financial Summary", ln=True)

    pdf.set_font("helvetica", size=12)
    # Keep PDF text ASCII-only to avoid encoding issues across fonts.
    pdf.cell(0, 8, f"Revenue   : INR {report.summary['revenue']:,.2f}", ln=True)
    pdf.cell(0, 8, f"Expenses  : INR {report.summary['expenses']:,.2f}", ln=True)
    pdf.cell(0, 8, f"Net Profit: INR {report.summary['profit']:,.2f}", ln=True)

    pdf.ln(15)

    # Optional anomalies section
    if not is_verified and report.anomalies:
        pdf.set_font("helvetica", "B", 13)
        pdf.cell(0, 10, "Anomalies (Top)", ln=True)
        pdf.set_font("helvetica", size=10)
        pdf.set_text_color(40, 40, 40)
        for a in report.anomalies[:15]:
            row = a.get("row", "N/A")
            field = a.get("field", "N/A")
            issue = a.get("issue", "Issue")
            suggestion = a.get("suggestion", "")
            text = f"Row {row} | {field}: {issue}" + (f" | Suggestion: {suggestion}" if suggestion else "")
            pdf.multi_cell(0, 5, text)

        pdf.ln(3)

    # Footer
    pdf.set_y(-40)
    pdf.set_font("helvetica", "I", 10)
    pdf.set_text_color(120, 120, 120)
    pdf.cell(0, 6, "Verified by Kavach Financial Intelligence System", ln=True, align="C")
    pdf.cell(0, 6, "Automated Compliance Certification", ln=True, align="C")

    output = pdf.output(dest="S")
    # fpdf2 may return `bytearray` for in-memory output; handle both types.
    if isinstance(output, (bytes, bytearray)):
        return bytes(output)
    return str(output).encode("latin1")
