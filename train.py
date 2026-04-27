"""
Training script for KAVACH fraud-risk scoring.

Upgrades included:
- calibrated probabilities,
- threshold tuning on validation data,
- reduced feature leakage from weak labels,
- richer persisted metadata for inference/explainability.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import joblib
import numpy as np
from sklearn.calibration import CalibratedClassifierCV
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import average_precision_score, f1_score, precision_recall_curve, roc_auc_score
from sklearn.model_selection import train_test_split

from features import engineer_transaction_features, split_features_labels
from ingestion import load_transactions_excel
from preprocessing import build_preprocessing_pipeline


def _choose_threshold(y_true: np.ndarray, y_prob: np.ndarray) -> float:
    precision, recall, thresholds = precision_recall_curve(y_true, y_prob)
    if thresholds.size == 0:
        return 0.5
    # precision/recall arrays are len(thresholds)+1
    f1 = (2 * precision[:-1] * recall[:-1]) / np.clip(precision[:-1] + recall[:-1], 1e-12, None)
    best_idx = int(np.nanargmax(f1))
    return float(thresholds[best_idx])


def train_model(input_path: Path, output_path: Path) -> None:
    df_raw = load_transactions_excel(input_path)
    df_with_features = engineer_transaction_features(df_raw)

    label_col = "rule_based_fraud_flag"
    artifacts, X_num = build_preprocessing_pipeline(df_with_features)

    # Avoid direct leakage by excluding exact rule-derived fields from the supervised input.
    engineered_cols = [
        "user_cumulative_spend",
        "user_category_spend",
        "user_tx_velocity_per_day",
        "rolling_mean_amount",
        "rolling_std_amount",
    ]
    engineered_subset = df_with_features.reindex(columns=engineered_cols).fillna(0.0).astype(float)
    X_full = np.hstack([X_num.values, engineered_subset.values])

    _, y = split_features_labels(df_with_features, label_column=label_col)
    if y is None:
        raise ValueError("I expected a 'rule_based_fraud_flag' column but could not find it.")

    y_arr = y.values.astype(int)
    class_counts = np.bincount(y_arr)
    if len(class_counts) < 2 or np.min(class_counts) < 2:
        raise ValueError(
            "Training requires at least 2 classes with >=2 samples each. "
            "Current weak labels are too imbalanced."
        )

    X_train, X_val, y_train, y_val = train_test_split(
        X_full,
        y_arr,
        test_size=0.2,
        random_state=42,
        stratify=y_arr,
    )

    base_rf = RandomForestClassifier(
        n_estimators=300,
        max_depth=10,
        min_samples_leaf=4,
        random_state=42,
        class_weight="balanced_subsample",
        n_jobs=-1,
    )
    clf = CalibratedClassifierCV(estimator=base_rf, method="sigmoid", cv=3)
    clf.fit(X_train, y_train)

    y_val_proba = clf.predict_proba(X_val)[:, 1]
    auc = roc_auc_score(y_val, y_val_proba)
    pr_auc = average_precision_score(y_val, y_val_proba)
    threshold = _choose_threshold(y_val, y_val_proba)
    y_val_pred = (y_val_proba >= threshold).astype(int)
    f1 = f1_score(y_val, y_val_pred)

    print(f"Validation ROC-AUC: {auc:.3f}")
    print(f"Validation PR-AUC : {pr_auc:.3f}")
    print(f"Tuned threshold   : {threshold:.3f}")
    print(f"Validation F1     : {f1:.3f}")

    feature_names = list(X_num.columns) + engineered_cols
    # CalibratedClassifierCV wraps multiple estimators; average feature importances.
    importances = np.mean(
        [est.estimator.feature_importances_ for est in clf.calibrated_classifiers_],
        axis=0,
    )

    model_bundle = {
        "preprocessing": artifacts,
        "engineered_feature_names": engineered_cols,
        "classifier": clf,
        "classification_threshold": threshold,
        "feature_names": feature_names,
        "feature_importances": importances.tolist(),
        "metrics": {
            "roc_auc": float(auc),
            "pr_auc": float(pr_auc),
            "f1_at_threshold": float(f1),
        },
    }
    joblib.dump(model_bundle, output_path)
    print(f"Saved model bundle to '{output_path}'.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Train a calibrated fraud-risk model for KAVACH.")
    parser.add_argument("--input", type=str, required=True, help="Path to input CSV/Excel file.")
    parser.add_argument("--output", type=str, default="model.pkl", help="Path to save model bundle.")
    args = parser.parse_args()

    train_model(Path(args.input), Path(args.output))


if __name__ == "__main__":
    main()
