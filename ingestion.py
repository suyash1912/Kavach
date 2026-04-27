"""
Data ingestion layer for KAVACH.

Loads CSV/Excel statements, normalizes column names, infers canonical fields,
and returns a dataframe with stable columns for downstream modeling.
"""

from __future__ import annotations

from pathlib import Path
from typing import Dict, Iterable, List

import numpy as np
import pandas as pd


REQUIRED_COLUMNS: List[str] = [
    "user_id",
    "amount",
    "category",
    "merchant",
    "country",
    "timestamp",
]


COLUMN_ALIASES: Dict[str, List[str]] = {
    "timestamp": ["timestamp", "date", "time", "txn_date", "transaction_date", "posted_date"],
    "amount": ["amount", "value", "amt", "transaction_amount", "debit", "credit", "net_amount"],
    "category": ["category", "type", "expense_type", "revenue_type", "particulars", "description"],
    "merchant": ["merchant", "vendor", "payee", "supplier", "counterparty", "party", "beneficiary"],
    "country": ["country", "nation", "region", "geo", "country_code", "location"],
    "user_id": ["user_id", "user", "customer", "client", "account", "account_id", "member", "subscriber"],
}


def _normalize_columns(columns: Iterable[str]) -> List[str]:
    return [str(c).strip().lower() for c in columns]


def _to_datetime_relaxed(series: pd.Series) -> pd.Series:
    """
    Parse mixed datetime strings without emitting pandas format-inference warnings.
    """
    parsed = pd.to_datetime(series, errors="coerce", format="ISO8601")
    missing = parsed.isna()
    if missing.any():
        parsed_mixed = pd.to_datetime(series[missing], errors="coerce", format="mixed")
        parsed.loc[missing] = parsed_mixed
    return parsed


def _frame_score(df: pd.DataFrame) -> int:
    if df is None or df.empty:
        return 0

    non_null = int(df.notna().sum().sum())
    numeric_cols = df.select_dtypes(include=[np.number]).shape[1]
    date_like = 0
    date_name_hints = ("date", "time", "timestamp", "posted", "month")

    # Keep this cheap: inspect only likely date columns and sample a bounded slice.
    for col in df.columns:
        col_name = str(col).lower()
        if not any(hint in col_name for hint in date_name_hints):
            continue
        series = df[col].dropna()
        if series.empty:
            continue
        sample = series.astype(str).head(200)
        parsed = _to_datetime_relaxed(sample)
        if parsed.notna().mean() > 0.5:
            date_like += 1

    return non_null + numeric_cols * 50 + date_like * 25


def _best_frame(frames: Iterable[pd.DataFrame]) -> pd.DataFrame:
    best: pd.DataFrame | None = None
    best_score = -1
    for df in frames:
        score = _frame_score(df)
        if score > best_score:
            best_score = score
            best = df
    return best if best is not None else pd.DataFrame()


def _coerce_numeric(series: pd.Series) -> pd.Series:
    cleaned = (
        series.astype(str)
        .str.replace(",", "", regex=False)
        .str.replace("(", "-", regex=False)
        .str.replace(")", "", regex=False)
        .str.replace("INR", "", case=False, regex=False)
        .str.replace("USD", "", case=False, regex=False)
        .str.replace("EUR", "", case=False, regex=False)
        .str.replace("GBP", "", case=False, regex=False)
        .str.replace(r"[^\d\.\-+eE]", "", regex=True)
    )
    return pd.to_numeric(cleaned, errors="coerce")


def _pick_column(df: pd.DataFrame, candidates: List[str]) -> str | None:
    for name in candidates:
        if name in df.columns:
            return name
    return None


def _infer_columns(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df.columns = _normalize_columns(df.columns)

    ts_col = _pick_column(df, COLUMN_ALIASES["timestamp"])
    if ts_col is None:
        date_candidates = [c for c in df.columns if "date" in c or "time" in c or "month" in c]
        best = None
        best_ratio = 0.0
        for c in date_candidates:
            parsed = _to_datetime_relaxed(df[c])
            ratio = parsed.notna().mean()
            if ratio > best_ratio:
                best_ratio = ratio
                best = c
        ts_col = best
    if ts_col:
        df["timestamp"] = _to_datetime_relaxed(df[ts_col])

    if "debit" in df.columns and "credit" in df.columns:
        df["amount"] = _coerce_numeric(df["credit"]).fillna(0) - _coerce_numeric(df["debit"]).fillna(0)
    else:
        amt_col = _pick_column(df, COLUMN_ALIASES["amount"])
        if amt_col and amt_col in df.columns:
            df["amount"] = _coerce_numeric(df[amt_col])
        else:
            numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
            if not numeric_cols:
                for c in df.columns:
                    coerced = _coerce_numeric(df[c])
                    if coerced.notna().mean() > 0.6:
                        df[c] = coerced
                        numeric_cols.append(c)
            if numeric_cols:
                variances = {c: df[c].var(skipna=True) for c in numeric_cols}
                best = max(variances, key=lambda k: variances[k] if pd.notna(variances[k]) else -1)
                df["amount"] = _coerce_numeric(df[best])

    if "category" not in df.columns:
        text_cols = df.select_dtypes(include=["object"]).columns.tolist()
        if text_cols:
            counts = {c: df[c].nunique(dropna=True) for c in text_cols}
            best = min(counts, key=lambda k: counts[k] if counts[k] > 0 else 1e9)
            df["category"] = df[best].fillna("General")

    merch_col = _pick_column(df, COLUMN_ALIASES["merchant"])
    if merch_col:
        df["merchant"] = df[merch_col]
    elif "merchant" not in df.columns:
        text_cols = df.select_dtypes(include=["object"]).columns.tolist()
        if text_cols:
            counts = {c: df[c].nunique(dropna=True) for c in text_cols}
            best = max(counts, key=lambda k: counts[k])
            df["merchant"] = df[best].fillna("Unknown")

    country_col = _pick_column(df, COLUMN_ALIASES["country"])
    if country_col:
        df["country"] = df[country_col]
    elif "country" not in df.columns:
        df["country"] = "Unknown"

    user_col = _pick_column(df, COLUMN_ALIASES["user_id"])
    if user_col:
        df["user_id"] = df[user_col]
    elif "user_id" not in df.columns:
        df["user_id"] = "user-1"

    if "timestamp" not in df.columns:
        df["timestamp"] = pd.to_datetime(pd.Timestamp.today()) + pd.to_timedelta(np.arange(len(df)), unit="D")
    else:
        missing = df["timestamp"].isna()
        if missing.all():
            df["timestamp"] = pd.to_datetime(pd.Timestamp.today()) + pd.to_timedelta(np.arange(len(df)), unit="D")
        else:
            df.loc[missing, "timestamp"] = pd.to_datetime(pd.Timestamp.today())

    if "amount" not in df.columns:
        df["amount"] = 0.0
    df["amount"] = _coerce_numeric(df["amount"]).fillna(0.0)

    if "category" not in df.columns:
        df["category"] = "General"
    if "merchant" not in df.columns:
        df["merchant"] = "Unknown"
    if "country" not in df.columns:
        df["country"] = "Unknown"
    if "user_id" not in df.columns:
        df["user_id"] = "user-1"

    return df


def load_transactions_excel(path: str | Path) -> pd.DataFrame:
    file_path = Path(path)
    if not file_path.exists():
        raise FileNotFoundError(f"I expected the file '{file_path}' to exist.")

    try:
        if file_path.suffix.lower() in (".xlsx", ".xls"):
            frames: List[pd.DataFrame] = []
            xls = pd.ExcelFile(file_path)
            for sheet in xls.sheet_names:
                for header in range(0, 6):
                    try:
                        frames.append(xls.parse(sheet, header=header))
                    except Exception:
                        continue
            df_raw = _best_frame(frames) if frames else pd.read_excel(file_path)
        else:
            frames = []
            for enc in ("utf-8-sig", "utf-8", "latin1"):
                for header in range(0, 4):
                    try:
                        frames.append(pd.read_csv(file_path, encoding=enc, header=header))
                    except Exception:
                        continue
            df_raw = _best_frame(frames) if frames else pd.read_csv(file_path, sep=None, engine="python")
    except Exception as exc:
        raise ValueError(f"I could not read the input file: {exc}") from exc

    df_raw = df_raw.dropna(axis=0, how="all").dropna(axis=1, how="all")
    return _infer_columns(df_raw)


__all__ = ["load_transactions_excel", "REQUIRED_COLUMNS"]
