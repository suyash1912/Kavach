"""
Company-focused Chartered Accountant (CA) analysis module.
Fully corrected anomaly detection + clean financial validation pipeline.
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
    "amount": ["amount", "value", "amt", "transaction_amount", "net_amount"],
    "category": ["category", "type", "expense_type", "revenue_type", "particulars", "description"],
    "vendor": ["vendor", "merchant", "supplier", "payee"],
    "customer": ["customer", "client", "payer"],
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
# NORMALIZATION
# ----------------------------
def _normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df.columns = [str(c).strip().lower() for c in df.columns]

    mapped = {}
    for canonical, variants in COLUMN_ALIASES.items():
        for v in variants:
            if v in df.columns:
                mapped[canonical] = v
                break

    # Handle debit/credit logic
    if "debit" in df.columns and "credit" in df.columns:
        df["amount"] = pd.to_numeric(df["credit"], errors="coerce").fillna(0) - \
                       pd.to_numeric(df["debit"], errors="coerce").fillna(0)

    for canonical, src in mapped.items():
        if canonical != src:
            df[canonical] = df[src]

    return df


# ----------------------------
# PREP
# ----------------------------
def _prepare_frame(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()

    df["date"] = pd.to_datetime(df.get("date"), errors="coerce")

    df["amount"] = pd.to_numeric(
        df.get("amount")
        .astype(str)
        .str.replace(",", "", regex=False)
        .str.replace("(", "-", regex=False)
        .str.replace(")", "", regex=False),
        errors="coerce",
    ).fillna(0.0)

    df["category"] = df.get("category").fillna("Uncategorized").astype(str)

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
        .agg(revenue=("amount", lambda s: s[s > 0].sum()),
             expenses=("amount", lambda s: s[s < 0].abs().sum()))
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

    # Basic checks
    for _, row in df.iterrows():
        if pd.isna(row["date"]):
            anomalies.append({"row": str(row.row_number), "field": "date", "issue": "Invalid date"})
        if pd.isna(row["amount"]):
            anomalies.append({"row": str(row.row_number), "field": "amount", "issue": "Missing amount"})
        if not row["category"].strip():
            anomalies.append({"row": str(row.row_number), "field": "category", "issue": "Missing category"})

    if len(df) < 50:
        return anomalies

    # Category-wise detection
    for category in df["category"].unique():

        cat_df = df[df["category"] == category]

        for subset in [cat_df[cat_df["amount"] > 0], cat_df[cat_df["amount"] < 0]]:

            if len(subset) < 30:
                continue

            amounts = subset["amount"].values

            # IQR
            q1, q3 = np.percentile(amounts, [25, 75])
            iqr = q3 - q1
            lb, ub = q1 - 1.5 * iqr, q3 + 1.5 * iqr

            stat_flags = (amounts < lb) | (amounts > ub)

            # ML
            X = StandardScaler().fit_transform(amounts.reshape(-1, 1))
            model = IsolationForest(contamination="auto", random_state=42)
            ml_flags = model.fit_predict(X) == -1

            final_flags = stat_flags & ml_flags

            for _, row in subset[final_flags].iterrows():
                anomalies.append({
                    "row": str(row.row_number),
                    "field": "amount",
                    "issue": "Unusual transaction detected",
                    "suggestion": "Verify transaction"
                })

    return anomalies


# ----------------------------
# CHARTS
# ----------------------------
def _plot_to_base64(fig):
    buf = BytesIO()
    fig.savefig(buf, format="png")
    return base64.b64encode(buf.getvalue()).decode()


def _build_charts(df):
    import matplotlib.pyplot as plt

    charts = {}

    fig, ax = plt.subplots()
    ax.plot(df.index, df["amount"])
    charts["trend"] = _plot_to_base64(fig)
    plt.close(fig)

    return charts


# ----------------------------
# MAIN
# ----------------------------
def analyze_company_file(path: str) -> Tuple[pd.DataFrame, CAReport]:
    df = pd.read_csv(path)

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
