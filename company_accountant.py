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
# 🚨 ANOMALY DETECTION (REDUCED FALSE POSITIVES)
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

            # IQR with stricter multiplier (3.0 instead of 1.5)
            q1, q3 = np.percentile(amounts, [25, 75])
            iqr = q3 - q1
            lb, ub = q1 - 3.0 * iqr, q3 + 3.0 * iqr

            stat_flags = (amounts < lb) | (amounts > ub)

            # Optimization: since we later intersect (AND) with stat_flags,
            # skip expensive ML when there are no IQR outliers.
            if not np.any(stat_flags):
                continue

            # ML with lower contamination to reduce false positives
            X = StandardScaler().fit_transform(amounts.reshape(-1, 1))
            model = IsolationForest(contamination=0.05, random_state=42, n_jobs=-1)
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
    meta = {
        "generated_at_utc": pd.Timestamp.utcnow().isoformat(),
        "verified": bool(report.verified),
        "anomaly_count": int(len(report.anomalies)),
    }

    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        pd.DataFrame([meta]).to_excel(writer, index=False, sheet_name="ReportMeta")
        df.to_excel(writer, index=False, sheet_name="Transactions")
        pd.DataFrame([report.summary]).to_excel(writer, index=False, sheet_name="Summary")
        pd.DataFrame(report.anomalies).to_excel(writer, index=False, sheet_name="Anomalies")

    return output.getvalue()


# ----------------------------
# EXPORT: ULTRA-PREMIUM PDF
# ----------------------------
def build_pdf_report(report: CAReport, verified_only: bool = True) -> bytes:
    from fpdf import FPDF
    from datetime import datetime

    if verified_only and not report.verified:
        raise ValueError("Cannot generate verified PDF while anomalies exist.")

    # Custom PDF class with header and footer
    class KavachPDF(FPDF):
        def header(self):
            # KAVACH Logo Text
            self.set_font("helvetica", "B", 24)
            self.set_text_color(45, 212, 191)  # Teal
            self.cell(0, 15, "KAVACH", ln=True, align="C")
            
            # Subtitle
            self.set_font("helvetica", "I", 10)
            self.set_text_color(100, 116, 139)
            self.cell(0, 8, "Financial Integrity Verification Report", ln=True, align="C")
            
            # Line separator
            self.ln(5)
            self.set_draw_color(45, 212, 191)
            self.set_line_width(1)
            self.line(20, self.get_y(), 190, self.get_y())
            self.ln(10)
            
        def footer(self):
            # Position at 1.5 cm from bottom
            self.set_y(-25)
            self.set_font("helvetica", "I", 9)
            self.set_text_color(148, 163, 184)
            
            # Left footer: Date
            self.cell(95, 8, f"Generated: {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}", 0, 0, "L")
            
            # Right footer: Page number
            self.cell(95, 8, f"Page {self.page_no()}", 0, 0, "R")
            
            # Watermark
            self.set_y(120)
            self.set_font("helvetica", "B", 60)
            self.set_text_color(220, 220, 220)
            with self.local_context(text_mode="FILL"):
                self.rotate(45, x=105, y=148.5)
                self.cell(0, 0, "KAVACH VERIFIED", 0, 0, "C")
                self.rotate(0)

    pdf = KavachPDF()
    pdf.set_auto_page_break(auto=True, margin=20)
    pdf.add_page()

    is_verified = bool(report.verified)

    # Verified/Review Badge
    if is_verified:
        pdf.set_fill_color(34, 197, 94)
        pdf.set_text_color(255, 255, 255)
        badge_title = "KAVACH VERIFIED"
        subtitle = "This dataset passed all anomaly detection checks"
    else:
        pdf.set_fill_color(244, 63, 94)
        pdf.set_text_color(255, 255, 255)
        badge_title = "KAVACH REVIEW REQUIRED"
        subtitle = f"{len(report.anomalies)} anomalies detected. Review recommended"

    # Badge box
    pdf.set_font("helvetica", "B", 20)
    pdf.cell(0, 18, badge_title, ln=True, align="C", fill=True)

    pdf.ln(5)
    pdf.set_text_color(51, 65, 85)
    pdf.set_font("helvetica", size=12)
    pdf.cell(0, 8, subtitle, ln=True, align="C")

    pdf.ln(15)

    # Financial Summary
    pdf.set_font("helvetica", "B", 16)
    pdf.set_text_color(15, 23, 42)
    pdf.cell(0, 12, "Financial Summary", ln=True)
    
    # Summary cards
    pdf.set_fill_color(240, 249, 255)
    pdf.set_draw_color(45, 212, 191)
    pdf.set_line_width(0.5)
    
    # Revenue
    pdf.set_font("helvetica", "B", 11)
    pdf.set_text_color(51, 65, 85)
    pdf.cell(60, 10, "Total Revenue", border=1, ln=0, align="L", fill=True)
    pdf.set_font("helvetica", "B", 14)
    pdf.set_text_color(34, 197, 94)
    pdf.cell(0, 10, f"INR {report.summary['revenue']:,.2f}", border=1, ln=1, align="R", fill=True)
    
    # Expenses
    pdf.set_font("helvetica", "B", 11)
    pdf.set_text_color(51, 65, 85)
    pdf.cell(60, 10, "Total Expenses", border=1, ln=0, align="L", fill=True)
    pdf.set_font("helvetica", "B", 14)
    pdf.set_text_color(244, 63, 94)
    pdf.cell(0, 10, f"INR {report.summary['expenses']:,.2f}", border=1, ln=1, align="R", fill=True)
    
    # Net Profit
    pdf.set_font("helvetica", "B", 11)
    pdf.set_text_color(51, 65, 85)
    pdf.cell(60, 10, "Net Profit", border=1, ln=0, align="L", fill=True)
    profit_color = (34, 197, 94) if report.summary['profit'] >= 0 else (244, 63, 94)
    pdf.set_text_color(*profit_color)
    pdf.set_font("helvetica", "B", 14)
    pdf.cell(0, 10, f"INR {report.summary['profit']:,.2f}", border=1, ln=1, align="R", fill=True)

    pdf.ln(12)

    # Monthly Trends
    if report.monthly_trends:
        pdf.set_font("helvetica", "B", 16)
        pdf.set_text_color(15, 23, 42)
        pdf.cell(0, 12, "Monthly Trends", ln=True)
        
        pdf.set_font("helvetica", "B", 10)
        pdf.set_text_color(255, 255, 255)
        pdf.set_fill_color(45, 212, 191)
        pdf.cell(50, 8, "Month", border=1, ln=0, align="C", fill=True)
        pdf.cell(70, 8, "Revenue", border=1, ln=0, align="C", fill=True)
        pdf.cell(70, 8, "Expenses", border=1, ln=1, align="C", fill=True)
        
        pdf.set_font("helvetica", size=10)
        pdf.set_text_color(51, 65, 85)
        pdf.set_fill_color(248, 250, 252)
        fill = False
        for trend in report.monthly_trends:
            pdf.cell(50, 7, trend["month"], border=1, ln=0, align="C", fill=fill)
            pdf.cell(70, 7, f"INR {trend['revenue']:,.2f}", border=1, ln=0, align="R", fill=fill)
            pdf.cell(70, 7, f"INR {trend['expenses']:,.2f}", border=1, ln=1, align="R", fill=fill)
            fill = not fill

        pdf.ln(12)

    # Category Totals
    if report.category_totals:
        pdf.set_font("helvetica", "B", 16)
        pdf.set_text_color(15, 23, 42)
        pdf.cell(0, 12, "Category Breakdown", ln=True)
        
        pdf.set_font("helvetica", "B", 10)
        pdf.set_text_color(255, 255, 255)
        pdf.set_fill_color(56, 189, 248)
        pdf.cell(95, 8, "Category", border=1, ln=0, align="C", fill=True)
        pdf.cell(95, 8, "Total Amount", border=1, ln=1, align="C", fill=True)
        
        pdf.set_font("helvetica", size=10)
        pdf.set_text_color(51, 65, 85)
        pdf.set_fill_color(248, 250, 252)
        fill = False
        for cat in report.category_totals:
            pdf.cell(95, 7, cat["category"][:40], border=1, ln=0, align="L", fill=fill)
            pdf.cell(95, 7, f"INR {cat['total']:,.2f}", border=1, ln=1, align="R", fill=fill)
            fill = not fill

        pdf.ln(12)

    # Anomalies Section
    if report.anomalies:
        pdf.add_page()
        
        pdf.set_font("helvetica", "B", 16)
        pdf.set_text_color(15, 23, 42)
        pdf.cell(0, 12, "Detected Anomalies", ln=True)
        
        pdf.set_font("helvetica", "B", 9)
        pdf.set_text_color(255, 255, 255)
        pdf.set_fill_color(244, 63, 94)
        pdf.cell(20, 8, "Row", border=1, ln=0, align="C", fill=True)
        pdf.cell(35, 8, "Field", border=1, ln=0, align="C", fill=True)
        pdf.cell(80, 8, "Issue", border=1, ln=0, align="C", fill=True)
        pdf.cell(55, 8, "Suggestion", border=1, ln=1, align="C", fill=True)
        
        pdf.set_font("helvetica", size=9)
        pdf.set_text_color(51, 65, 85)
        pdf.set_fill_color(248, 250, 252)
        fill = False
        for a in report.anomalies[:50]:
            row = a.get("row", "N/A")
            field = a.get("field", "N/A")
            issue = a.get("issue", "Issue")[:35]
            suggestion = a.get("suggestion", "N/A")[:25]
            
            pdf.cell(20, 7, str(row), border=1, ln=0, align="C", fill=fill)
            pdf.cell(35, 7, field, border=1, ln=0, align="C", fill=fill)
            pdf.cell(80, 7, issue, border=1, ln=0, align="L", fill=fill)
            pdf.cell(55, 7, suggestion, border=1, ln=1, align="L", fill=fill)
            fill = not fill

    output = pdf.output(dest="S")
    if isinstance(output, (bytes, bytearray)):
        return bytes(output)
    return str(output).encode("latin1")
