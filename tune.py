"""
Optuna tuning for KAVACH fraud-risk model.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import joblib
import numpy as np
import optuna
from sklearn.calibration import CalibratedClassifierCV
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import average_precision_score, roc_auc_score
from sklearn.model_selection import train_test_split

from features import engineer_transaction_features, split_features_labels
from ingestion import load_transactions_excel
from preprocessing import build_preprocessing_pipeline


def _prepare_training_data(path: Path):
    df_raw = load_transactions_excel(path)
    df_with_features = engineer_transaction_features(df_raw)

    artifacts, X_num = build_preprocessing_pipeline(df_with_features)
    engineered_cols = [
        "user_cumulative_spend",
        "user_category_spend",
        "user_tx_velocity_per_day",
        "rolling_mean_amount",
        "rolling_std_amount",
    ]
    engineered_subset = df_with_features.reindex(columns=engineered_cols).fillna(0.0).astype(float)
    X_full = np.hstack([X_num.values, engineered_subset.values])

    _, y = split_features_labels(df_with_features, label_column="rule_based_fraud_flag")
    if y is None:
        raise ValueError("I expected a 'rule_based_fraud_flag' column but could not find it.")
    return X_full, y.values.astype(int), artifacts, engineered_cols, list(X_num.columns) + engineered_cols


def tune_hyperparameters(input_path: Path, n_trials: int = 25) -> dict:
    X, y, artifacts, engineered_cols, feature_names = _prepare_training_data(input_path)
    class_counts = np.bincount(y)
    if len(class_counts) < 2 or np.min(class_counts) < 2:
        raise ValueError("Need at least 2 classes with >=2 samples each for tuning.")

    X_train, X_val, y_train, y_val = train_test_split(
        X,
        y,
        test_size=0.2,
        random_state=42,
        stratify=y,
    )

    def objective(trial: optuna.Trial) -> float:
        n_estimators = trial.suggest_int("n_estimators", 150, 450, step=50)
        max_depth = trial.suggest_int("max_depth", 5, 16)
        min_samples_leaf = trial.suggest_int("min_samples_leaf", 2, 10)

        base = RandomForestClassifier(
            n_estimators=n_estimators,
            max_depth=max_depth,
            min_samples_leaf=min_samples_leaf,
            random_state=42,
            class_weight="balanced_subsample",
            n_jobs=-1,
        )
        clf = CalibratedClassifierCV(estimator=base, method="sigmoid", cv=3)
        clf.fit(X_train, y_train)
        y_val_proba = clf.predict_proba(X_val)[:, 1]
        # Prefer PR-AUC in imbalanced problems.
        return average_precision_score(y_val, y_val_proba)

    study = optuna.create_study(direction="maximize")
    study.optimize(objective, n_trials=n_trials)

    best = study.best_params
    print("Finished hyperparameter tuning.")
    print(f"Best PR-AUC: {study.best_value:.3f}")
    print("Best parameters:")
    for k, v in best.items():
        print(f"  {k}: {v}")

    base = RandomForestClassifier(
        n_estimators=best["n_estimators"],
        max_depth=best["max_depth"],
        min_samples_leaf=best["min_samples_leaf"],
        random_state=42,
        class_weight="balanced_subsample",
        n_jobs=-1,
    )
    clf = CalibratedClassifierCV(estimator=base, method="sigmoid", cv=3)
    clf.fit(X, y)
    y_prob = clf.predict_proba(X)[:, 1]
    roc = roc_auc_score(y, y_prob)
    pr_auc = average_precision_score(y, y_prob)

    importances = np.mean(
        [est.estimator.feature_importances_ for est in clf.calibrated_classifiers_],
        axis=0,
    )

    model_bundle = {
        "preprocessing": artifacts,
        "engineered_feature_names": engineered_cols,
        "classifier": clf,
        "classification_threshold": 0.5,
        "feature_names": feature_names,
        "feature_importances": importances.tolist(),
        "metrics": {
            "roc_auc": float(roc),
            "pr_auc": float(pr_auc),
        },
        "tuned_params": best,
    }
    joblib.dump(model_bundle, Path("model_tuned.pkl"))
    print("Saved tuned model bundle to 'model_tuned.pkl'.")
    return best


def main() -> None:
    parser = argparse.ArgumentParser(description="Tune RandomForest hyperparameters for KAVACH.")
    parser.add_argument("--input", type=str, required=True, help="Path to input CSV/Excel file.")
    parser.add_argument("--trials", type=int, default=25, help="Number of Optuna trials.")
    args = parser.parse_args()
    tune_hyperparameters(Path(args.input), n_trials=args.trials)


if __name__ == "__main__":
    main()
