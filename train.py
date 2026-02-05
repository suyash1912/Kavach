"""
In this script, I train a simple fraud‑risk classifier for KAVACH.
I assume access to an Excel file with transaction data and I rely on
the feature engineering pipeline from `preprocessing.py` and
`features.py`.

I intentionally keep this script small and readable so that it feels
like an academic project submission rather than a production ML stack.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import joblib
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import train_test_split

from features import engineer_transaction_features, split_features_labels
from ingestion import load_transactions_excel
from preprocessing import PreprocessingArtifacts, build_preprocessing_pipeline


def train_model(input_path: Path, output_path: Path) -> None:
    """
    Here I orchestrate ingestion, preprocessing, feature engineering,
    model training, and model persistence into a single pipeline.
    """
    df_raw = load_transactions_excel(input_path)

    # I engineer domain‑specific features first.
    df_with_features = engineer_transaction_features(df_raw)

    # For this academic setup, I treat the rule‑based flag as a weak label.
    label_col = "rule_based_fraud_flag"

    # I build a preprocessing pipeline to turn structured data into a matrix.
    artifacts, X_num = build_preprocessing_pipeline(df_with_features)

    # I append engineered numeric features that are not inside the preprocessor.
    engineered_cols = [
        "user_cumulative_spend",
        "user_category_spend",
        "user_tx_velocity_per_day",
        "rolling_mean_amount",
        "rolling_std_amount",
        "zscore_amount",
        "country_changed",
    ]
    engineered_subset = df_with_features[engineered_cols].fillna(0.0).astype(float)
    X_full = np.hstack([X_num.values, engineered_subset.values])

    # I compute a matching label vector.
    _, y = split_features_labels(df_with_features, label_column=label_col)
    if y is None:
        raise ValueError(
            "I expected a 'rule_based_fraud_flag' column but could not find it."
        )

    X_train, X_val, y_train, y_val = train_test_split(
        X_full, y.values, test_size=0.2, random_state=42, stratify=y.values
    )

    # I pick a RandomForest because it is robust and easy to interpret.
    clf = RandomForestClassifier(
        n_estimators=200,
        max_depth=8,
        min_samples_leaf=5,
        random_state=42,
        class_weight="balanced",
    )
    clf.fit(X_train, y_train)

    y_val_proba = clf.predict_proba(X_val)[:, 1]
    auc = roc_auc_score(y_val, y_val_proba)
    print(f"I trained a RandomForest model with validation ROC‑AUC = {auc:.3f}")

    # I store both the preprocessing artifacts and the trained model.
    model_bundle = {
        "preprocessing": artifacts,
        "engineered_feature_names": engineered_cols,
        "classifier": clf,
    }
    joblib.dump(model_bundle, output_path)
    print(f"I saved the model bundle to '{output_path}'.")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Train a fraud‑risk model for the KAVACH demo."
    )
    parser.add_argument(
        "--input",
        type=str,
        required=True,
        help="Path to the input Excel file with transactions.",
    )
    parser.add_argument(
        "--output",
        type=str,
        default="model.pkl",
        help="Where I should save the trained model bundle.",
    )
    args = parser.parse_args()

    input_path = Path(args.input)
    output_path = Path(args.output)
    train_model(input_path, output_path)


if __name__ == "__main__":
    main()

