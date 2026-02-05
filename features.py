"""
In this module, I focus on feature engineering that is specific to
financial‑transaction analysis and fraud detection for KAVACH.

On top of the generic preprocessing pipeline, I engineer:
- user‑level spending per category,
- transaction velocity per user,
- rolling statistics per user,
- z‑score style anomaly scores,
- and a simple country‑change flag.
"""

from __future__ import annotations

from typing import Tuple

import numpy as np
import pandas as pd

from preprocessing import AMOUNT_COLUMN, TIMESTAMP_COLUMN


def _sort_by_user_time(df: pd.DataFrame) -> pd.DataFrame:
    """
    In this helper, I simply sort by user and timestamp to make all
    rolling and lag‑based calculations easier to reason about.
    """
    return df.sort_values(["user_id", TIMESTAMP_COLUMN]).reset_index(drop=True)


def engineer_transaction_features(df_raw: pd.DataFrame) -> pd.DataFrame:
    """
    Here I take a transaction‑level DataFrame and add several columns that
    are useful for downstream modeling and for interpretability in the UI.

    I intentionally keep everything at the transaction granularity so that
    each row still represents a single payment event.
    """
    df = df_raw.copy()
    # I coerce timestamps early so downstream .dt access is safe.
    df[TIMESTAMP_COLUMN] = pd.to_datetime(df[TIMESTAMP_COLUMN], errors="coerce")
    df = df.dropna(subset=[TIMESTAMP_COLUMN])
    df = _sort_by_user_time(df)

    # I compute simple per‑user cumulative spend and per‑category spend.
    df["user_cumulative_spend"] = df.groupby("user_id")[AMOUNT_COLUMN].cumsum()
    df["user_category_spend"] = (
        df.groupby(["user_id", "category"])[AMOUNT_COLUMN]
        .cumsum()
        .astype(float)
    )

    # I approximate transaction velocity as "transactions per day" for each user.
    df["tx_date"] = df[TIMESTAMP_COLUMN].dt.date
    user_day_counts = df.groupby(["user_id", "tx_date"])["amount"].transform("count")
    df["user_tx_velocity_per_day"] = user_day_counts.astype(float)

    # I flag unusually high velocity days per user (simple heuristic).
    # This keeps the rule interpretable for the UI.
    velocity_threshold = max(5.0, df["user_tx_velocity_per_day"].quantile(0.9))
    df["velocity_flag"] = df["user_tx_velocity_per_day"] > velocity_threshold

    # I compute rolling mean and std for the last 10 transactions per user.
    window_size = 10
    df["rolling_mean_amount"] = (
        df.groupby("user_id")[AMOUNT_COLUMN]
        .rolling(window_size, min_periods=3)
        .mean()
        .reset_index(level=0, drop=True)
    )
    df["rolling_std_amount"] = (
        df.groupby("user_id")[AMOUNT_COLUMN]
        .rolling(window_size, min_periods=3)
        .std()
        .reset_index(level=0, drop=True)
    )

    # I compute a simple z‑score style anomaly measure per user.
    # I guard against division by zero by adding a small epsilon.
    eps = 1e-6
    df["zscore_amount"] = (
        df[AMOUNT_COLUMN] - df["rolling_mean_amount"]
    ) / (df["rolling_std_amount"].fillna(0.0) + eps)

    # I flag transactions with large absolute z‑scores as "statistically unusual".
    df["is_amount_anomaly"] = df["zscore_amount"].abs() > 3.0

    # I track country changes within each user's sequence of transactions.
    df["prev_country"] = df.groupby("user_id")["country"].shift(1)
    df["country_changed"] = (df["prev_country"].notna()) & (
        df["country"] != df["prev_country"]
    )

    # For convenience, I also create a composite "rule‑based fraud" flag
    # that I can optionally use as a weak label in the training script.
    df["rule_based_fraud_flag"] = (
        df["is_amount_anomaly"].fillna(False) | df["country_changed"].fillna(False)
    )

    # If the dataset already includes a fraud/risk label, I fold it in.
    label_candidates = [
        "risk_label",
        "fraud_label",
        "fraud_flag",
        "is_fraud",
        "is_fraudulent",
    ]
    existing_label_col = next(
        (col for col in label_candidates if col in df.columns), None
    )
    if existing_label_col:
        df["dataset_fraud_flag"] = (
            pd.to_numeric(df[existing_label_col], errors="coerce")
            .fillna(0)
            .astype(int)
            .astype(bool)
        )
        df["rule_based_fraud_flag"] = (
            df["rule_based_fraud_flag"] | df["dataset_fraud_flag"]
        )

    return df


def split_features_labels(
    df_features: pd.DataFrame, label_column: str | None = None
) -> Tuple[pd.DataFrame, pd.Series | None]:
    """
    In this helper, I separate a feature frame into X and y. When there is
    no explicit label column, I simply return None for y so that callers
    can decide how to handle unsupervised or weakly supervised setups.
    """
    if label_column is None or label_column not in df_features.columns:
        return df_features, None

    y = df_features[label_column].astype(int)
    X = df_features.drop(columns=[label_column])
    return X, y


__all__ = ["engineer_transaction_features", "split_features_labels"]
