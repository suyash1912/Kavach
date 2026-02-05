"""
In this script, I use Optuna to tune a RandomForest classifier for
fraud‑risk scoring in KAVACH. My objective is to maximize ROC‑AUC
on a simple validation split.

I keep the search space intentionally modest so that the tuning run
is realistic for a local academic project.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import joblib
import numpy as np
import optuna
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import train_test_split

from features import engineer_transaction_features, split_features_labels
from ingestion import load_transactions_excel
from preprocessing import build_preprocessing_pipeline


def _prepare_training_data(path: Path):
    """
    Here I centralize the data preparation so that each Optuna trial
    can reuse the same cached feature matrix.
    """
    df_raw = load_transactions_excel(path)
    df_with_features = engineer_transaction_features(df_raw)

    artifacts, X_num = build_preprocessing_pipeline(df_with_features)
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

    _, y = split_features_labels(df_with_features, label_column="rule_based_fraud_flag")
    if y is None:
        raise ValueError(
            "I expected a 'rule_based_fraud_flag' column but could not find it."
        )

    return X_full, y.values, artifacts, engineered_cols


def tune_hyperparameters(input_path: Path, n_trials: int = 25) -> dict:
    """
    I define and run the Optuna study here, returning the best set of
    hyperparameters and printing a short summary to stdout.
    """
    X, y, artifacts, engineered_cols = _prepare_training_data(input_path)

    X_train, X_val, y_train, y_val = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    def objective(trial: optuna.Trial) -> float:
        n_estimators = trial.suggest_int("n_estimators", 100, 400, step=50)
        max_depth = trial.suggest_int("max_depth", 4, 16)
        min_samples_leaf = trial.suggest_int("min_samples_leaf", 1, 10)

        clf = RandomForestClassifier(
            n_estimators=n_estimators,
            max_depth=max_depth,
            min_samples_leaf=min_samples_leaf,
            random_state=42,
            class_weight="balanced",
        )
        clf.fit(X_train, y_train)
        y_val_proba = clf.predict_proba(X_val)[:, 1]
        auc = roc_auc_score(y_val, y_val_proba)
        return auc

    study = optuna.create_study(direction="maximize")
    study.optimize(objective, n_trials=n_trials)

    print("I finished hyperparameter tuning.")
    print(f"Best ROC‑AUC: {study.best_value:.3f}")
    print("Best parameters:")
    for k, v in study.best_params.items():
        print(f"  {k}: {v}")

    # Optionally, I could retrain and save a tuned model bundle here.
    best_params = study.best_params
    clf = RandomForestClassifier(
        n_estimators=best_params["n_estimators"],
        max_depth=best_params["max_depth"],
        min_samples_leaf=best_params["min_samples_leaf"],
        random_state=42,
        class_weight="balanced",
    )
    clf.fit(X, y)
    model_bundle = {
        "preprocessing": artifacts,
        "engineered_feature_names": engineered_cols,
        "classifier": clf,
        "tuned_params": best_params,
    }
    joblib.dump(model_bundle, Path("model_tuned.pkl"))
    print("I saved the tuned model bundle to 'model_tuned.pkl'.")

    return best_params


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Tune RandomForest hyperparameters for KAVACH."
    )
    parser.add_argument(
        "--input",
        type=str,
        required=True,
        help="Path to the input Excel file with transactions.",
    )
    parser.add_argument(
        "--trials",
        type=int,
        default=25,
        help="How many Optuna trials I should run.",
    )
    args = parser.parse_args()

    tune_hyperparameters(Path(args.input), n_trials=args.trials)


if __name__ == "__main__":
    main()

