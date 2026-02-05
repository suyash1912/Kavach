"""
In this module, I implement the preprocessing pipeline for KAVACH.
I intentionally keep the logic modular so that I can reuse it both
offline (in `train.py` / `tune.py`) and online inside the FastAPI app.

I handle:
- basic missing‑value imputation,
- timestamp conversion and feature extraction,
- numeric scaling,
- and categorical encoding.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Tuple

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler


TIMESTAMP_COLUMN = "timestamp"
AMOUNT_COLUMN = "amount"


@dataclass
class PreprocessingArtifacts:
    """
    I use this dataclass as a light‑weight container to keep the fitted
    preprocessing pipeline together with the feature‑name metadata.
    """

    pipeline: Pipeline
    feature_names: List[str]


def _prepare_base_frame(df: pd.DataFrame) -> pd.DataFrame:
    """
    In this helper, I enforce core dtypes and derive basic time features.
    I never mutate the input DataFrame in‑place to avoid side effects.
    """
    df_proc = df.copy()

    # I coerce timestamps and drop completely invalid rows.
    df_proc[TIMESTAMP_COLUMN] = pd.to_datetime(
        df_proc[TIMESTAMP_COLUMN], errors="coerce"
    )
    df_proc = df_proc.dropna(subset=[TIMESTAMP_COLUMN])

    # I ensure the amount is numeric; invalid values become NaN then 0.0.
    df_proc[AMOUNT_COLUMN] = pd.to_numeric(
        df_proc[AMOUNT_COLUMN], errors="coerce"
    ).fillna(0.0)

    # I derive simple, interpretable calendar features.
    df_proc["tx_year"] = df_proc[TIMESTAMP_COLUMN].dt.year
    df_proc["tx_month"] = df_proc[TIMESTAMP_COLUMN].dt.month
    df_proc["tx_day"] = df_proc[TIMESTAMP_COLUMN].dt.day
    df_proc["tx_hour"] = df_proc[TIMESTAMP_COLUMN].dt.hour
    df_proc["tx_dayofweek"] = df_proc[TIMESTAMP_COLUMN].dt.dayofweek

    return df_proc


def build_preprocessing_pipeline(
    df: pd.DataFrame,
) -> Tuple[PreprocessingArtifacts, pd.DataFrame]:
    """
    Here I build and fit a scikit‑learn preprocessing pipeline that can
    transform raw transaction records into a numeric feature matrix.

    I return both the fitted artifacts and the transformed feature matrix
    so that `train.py` can immediately move on to model training.
    """
    df_base = _prepare_base_frame(df)

    # I define which columns I treat as numeric vs categorical.
    numeric_features = [
        AMOUNT_COLUMN,
        "tx_year",
        "tx_month",
        "tx_day",
        "tx_hour",
        "tx_dayofweek",
    ]
    categorical_features = ["user_id", "category", "merchant", "country"]

    numeric_transformer = Pipeline(
        steps=[
            ("imputer", "passthrough"),  # I rely on fillna above for now.
            ("scaler", StandardScaler()),
        ]
    )
    categorical_transformer = Pipeline(
        steps=[
            (
                "onehot",
                OneHotEncoder(
                    handle_unknown="ignore",
                    sparse_output=False,  # I keep it dense for simplicity.
                ),
            )
        ]
    )

    preprocessor = ColumnTransformer(
        transformers=[
            ("num", numeric_transformer, numeric_features),
            ("cat", categorical_transformer, categorical_features),
        ]
    )

    # I wrap everything in a Pipeline for easier reuse later if needed.
    pipe = Pipeline(steps=[("preprocessor", preprocessor)])

    X = pipe.fit_transform(df_base)

    # I reconstruct feature names so that downstream analysis is interpretable.
    num_names = numeric_features
    cat_ohe: OneHotEncoder = pipe.named_steps["preprocessor"].named_transformers_[
        "cat"
    ].named_steps["onehot"]
    cat_names = list(cat_ohe.get_feature_names_out(categorical_features))
    feature_names = num_names + cat_names

    artifacts = PreprocessingArtifacts(pipeline=pipe, feature_names=feature_names)
    X_df = pd.DataFrame(X, columns=feature_names, index=df_base.index)

    return artifacts, X_df


def transform_with_artifacts(
    df: pd.DataFrame, artifacts: PreprocessingArtifacts
) -> pd.DataFrame:
    """
    Once I have a fitted preprocessing pipeline, I use this helper to
    transform new incoming data (for example, fresh uploads through the API)
    into the same feature space.
    """
    df_base = _prepare_base_frame(df)
    X = artifacts.pipeline.transform(df_base)
    X_df = pd.DataFrame(X, columns=artifacts.feature_names, index=df_base.index)
    return X_df


__all__ = [
    "PreprocessingArtifacts",
    "build_preprocessing_pipeline",
    "transform_with_artifacts",
    "TIMESTAMP_COLUMN",
    "AMOUNT_COLUMN",
]

