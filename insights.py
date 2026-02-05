"""
In this module, I generate high‑level business insights from raw or
feature‑augmented transaction data. These aggregates feed both the
visual dashboard and the GenAI explanation layer.
"""

from __future__ import annotations

from typing import Dict, List, Tuple

import pandas as pd

from preprocessing import AMOUNT_COLUMN, TIMESTAMP_COLUMN


def compute_basic_insights(df: pd.DataFrame) -> Dict:
    """
    Here I compute a compact dictionary of insights that is easy to
    serialize to JSON and to feed into the GenAI prompt.
    """
    if df.empty:
        return {
            "total_spend": 0.0,
            "top_categories": [],
            "monthly_trends": [],
            "user_summaries": [],
        }

    total_spend = float(df[AMOUNT_COLUMN].sum())

    # I compute top categories by total spend.
    top_cats_series = (
        df.groupby("category")[AMOUNT_COLUMN].sum().sort_values(ascending=False)
    )
    top_categories = [
        {"category": str(cat), "total_spend": float(val)}
        for cat, val in top_cats_series.items()
    ]

    # I resample by month to build a friendly time series.
    df_ts = df.copy()
    df_ts[TIMESTAMP_COLUMN] = pd.to_datetime(df_ts[TIMESTAMP_COLUMN], errors="coerce")
    df_ts = df_ts.dropna(subset=[TIMESTAMP_COLUMN])
    df_ts = df_ts.set_index(TIMESTAMP_COLUMN)
    monthly = df_ts[AMOUNT_COLUMN].resample("M").sum()
    monthly_trends = [
        {"month": idx.strftime("%Y-%m"), "total_spend": float(val)}
        for idx, val in monthly.items()
    ]

    # I compute user‑level summaries that mirror how an analyst would talk.
    per_user = (
        df.groupby("user_id")
        .agg(
            total_spend=(AMOUNT_COLUMN, "sum"),
            avg_transaction=(AMOUNT_COLUMN, "mean"),
            tx_count=(AMOUNT_COLUMN, "count"),
        )
        .reset_index()
    )
    user_summaries = [
        {
            "user_id": str(row["user_id"]),
            "total_spend": float(row["total_spend"]),
            "avg_transaction": float(row["avg_transaction"]),
            "tx_count": int(row["tx_count"]),
        }
        for _, row in per_user.iterrows()
    ]

    return {
        "total_spend": total_spend,
        "top_categories": top_categories,
        "monthly_trends": monthly_trends,
        "user_summaries": user_summaries,
    }


def build_fraud_table(df_with_flags: pd.DataFrame) -> List[Dict]:
    """
    Given a transaction frame that already contains model scores and
    rule‑based flags, I prepare a lean table for rendering in the
    dashboard and for passing to the GenAI layer.

    I filter to return ONLY flagged/risky transactions where:
    - rule_based_fraud_flag is True, OR
    - model_fraud_flag is True, OR
    - fraud_score > 0.5
    """
    if df_with_flags.empty:
        return []

    # Filter to only include flagged transactions
    fraud_mask = pd.Series([False] * len(df_with_flags), index=df_with_flags.index)
    
    if "rule_based_fraud_flag" in df_with_flags.columns:
        fraud_mask = fraud_mask | df_with_flags["rule_based_fraud_flag"].fillna(False)
    
    if "model_fraud_flag" in df_with_flags.columns:
        fraud_mask = fraud_mask | df_with_flags["model_fraud_flag"].fillna(False)
    
    if "fraud_score" in df_with_flags.columns:
        fraud_mask = fraud_mask | (df_with_flags["fraud_score"] > 0.5)
    
    # Apply the filter
    df_flagged = df_with_flags[fraud_mask].copy()
    
    if df_flagged.empty:
        return []

    df_flagged = df_flagged.copy()
    if "id" not in df_flagged.columns:
        df_flagged["id"] = df_flagged.index.astype(int)

    columns_to_keep = [
        "id",
        "user_id",
        "timestamp",
        "amount",
        "category",
        "merchant",
        "country",
    ]
    # I gracefully handle the situation where some score columns are absent.
    if "fraud_score" in df_flagged.columns:
        columns_to_keep.append("fraud_score")
    if "rule_based_fraud_flag" in df_flagged.columns:
        columns_to_keep.append("rule_based_fraud_flag")
    if "model_fraud_flag" in df_flagged.columns:
        columns_to_keep.append("model_fraud_flag")
    if "velocity_flag" in df_flagged.columns:
        columns_to_keep.append("velocity_flag")

    table_rows = []
    for _, row in df_flagged[columns_to_keep].iterrows():
        record = {k: row[k] for k in columns_to_keep}
        # I convert timestamps to ISO strings for JSON serialization.
        if isinstance(record.get("timestamp"), pd.Timestamp):
            record["timestamp"] = record["timestamp"].isoformat()
        record["amount"] = float(record["amount"])
        if "fraud_score" in record and record["fraud_score"] is not None:
            record["fraud_score"] = float(record["fraud_score"])
        if "rule_based_fraud_flag" in record:
            record["rule_based_fraud_flag"] = bool(record["rule_based_fraud_flag"])
        if "model_fraud_flag" in record:
            record["model_fraud_flag"] = bool(record["model_fraud_flag"])
        if "velocity_flag" in record:
            record["velocity_flag"] = bool(record["velocity_flag"])
        table_rows.append(record)

    # Sort by fraud score descending (highest risk first)
    table_rows.sort(key=lambda x: x.get("fraud_score", 0), reverse=True)

    return table_rows


def build_cluster_insights(df_with_flags: pd.DataFrame) -> List[Dict]:
    """
    Build lightweight, human-readable anomaly clusters for the dashboard.
    I keep this heuristic and interpretable for a premium demo experience.
    """
    if df_with_flags.empty:
        return []

    df = df_with_flags.copy()
    if "fraud_score" not in df.columns:
        return []

    # Normalize fraud scores into a 0-1 range for consistent UI.
    scores = pd.to_numeric(df["fraud_score"], errors="coerce").fillna(0.0)
    score_max = max(scores.max(), 1e-6)
    df["risk_norm"] = (scores / score_max).clip(0, 1)

    clusters = []

    # Top risky categories
    if "category" in df.columns:
        cat_scores = (
            df.groupby("category")["risk_norm"]
            .mean()
            .sort_values(ascending=False)
            .head(3)
        )
        for cat, val in cat_scores.items():
            clusters.append({"name": f"Category spike: {cat}", "score": float(val)})

    # Top risky countries
    if "country" in df.columns:
        country_scores = (
            df.groupby("country")["risk_norm"]
            .mean()
            .sort_values(ascending=False)
            .head(2)
        )
        for ctry, val in country_scores.items():
            clusters.append({"name": f"Geo hotspot: {ctry}", "score": float(val)})

    # Velocity-heavy users
    if "user_tx_velocity_per_day" in df.columns:
        velocity = (
            df.groupby("user_id")["user_tx_velocity_per_day"]
            .mean()
            .sort_values(ascending=False)
            .head(2)
        )
        for user, val in velocity.items():
            normalized = min(float(val) / max(float(velocity.max()), 1.0), 1.0)
            clusters.append({"name": f"Velocity burst: {user}", "score": normalized})

    # Keep top 5 clusters
    clusters = sorted(clusters, key=lambda x: x["score"], reverse=True)[:5]
    return clusters


__all__ = ["compute_basic_insights", "build_fraud_table", "build_cluster_insights"]
