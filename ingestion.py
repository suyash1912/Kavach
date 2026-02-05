"""
In this module, I implement the data ingestion layer for the KAVACH platform.
I focus on loading Excel transaction files, validating schema, and returning
clean pandas DataFrames that the rest of the pipeline can safely consume.
"""

from __future__ import annotations

from pathlib import Path
from typing import Iterable, List, Dict, Tuple

import pandas as pd
import numpy as np


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
    """
    In this helper, I normalize column names by stripping spaces
    and lower‑casing everything so that the ingestion step is a bit
    more forgiving about minor formatting differences.
    """
    return [str(c).strip().lower() for c in columns]


def _frame_score(df: pd.DataFrame) -> int:
    if df is None or df.empty:
        return 0
    non_null = int(df.notna().sum().sum())
    numeric_cols = df.select_dtypes(include=[np.number]).shape[1]
    date_like = 0
    for c in df.columns:
        try:
            parsed = pd.to_datetime(df[c], errors="coerce")
            if parsed.notna().mean() > 0.5:
                date_like += 1
        except Exception:
            continue
    return non_null + numeric_cols * 50 + date_like * 25


def _best_frame(frames: Iterable[pd.DataFrame]) -> pd.DataFrame:
    best = None
    best_score = -1
    for df in frames:
        score = _frame_score(df)
        if score > best_score:
            best_score = score
            best = df
    return best if best is not None else pd.DataFrame()


def _coerce_numeric(series: pd.Series) -> pd.Series:
    return pd.to_numeric(
        series.astype(str)
        .str.replace(",", "", regex=False)
        .str.replace("(", "-", regex=False)
        .str.replace(")", "", regex=False)
        .str.replace("₹", "", regex=False)
        .str.replace("$", "", regex=False)
        .str.replace("€", "", regex=False)
        .str.replace("£", "", regex=False),
        errors="coerce",
    )


def _pick_column(df: pd.DataFrame, candidates: List[str]) -> str | None:
    for name in candidates:
        if name in df.columns:
            return name
    return None


def _infer_columns(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()

    # Normalize column names early.
    df.columns = _normalize_columns(df.columns)

    # Timestamp inference
    ts_col = _pick_column(df, COLUMN_ALIASES["timestamp"])
    if ts_col is None:
        date_candidates = [c for c in df.columns if "date" in c or "time" in c or "month" in c]
        best = None
        best_ratio = 0.0
        for c in date_candidates:
            parsed = pd.to_datetime(df[c], errors="coerce")
            ratio = parsed.notna().mean()
            if ratio > best_ratio:
                best_ratio = ratio
                best = c
        ts_col = best
    if ts_col:
        df["timestamp"] = pd.to_datetime(df[ts_col], errors="coerce")

    # Amount inference
    if "debit" in df.columns and "credit" in df.columns:
        df["amount"] = _coerce_numeric(df["credit"]).fillna(0) - _coerce_numeric(df["debit"]).fillna(0)
    else:
        amt_col = _pick_column(df, COLUMN_ALIASES["amount"])
        if amt_col and amt_col in df.columns:
            df["amount"] = _coerce_numeric(df[amt_col])
        else:
            numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
            if not numeric_cols:
                numeric_cols = []
                for c in df.columns:
                    coerced = _coerce_numeric(df[c])
                    if coerced.notna().mean() > 0.6:
                        df[c] = coerced
                        numeric_cols.append(c)
            if numeric_cols:
                variances = {c: df[c].var(skipna=True) for c in numeric_cols}
                best = max(variances, key=lambda k: variances[k] if pd.notna(variances[k]) else -1)
                df["amount"] = _coerce_numeric(df[best])

    # Category inference
    if "category" not in df.columns:
        text_cols = df.select_dtypes(include=["object"]).columns.tolist()
        if text_cols:
            counts = {c: df[c].nunique(dropna=True) for c in text_cols}
            best = min(counts, key=lambda k: counts[k] if counts[k] > 0 else 1e9)
            df["category"] = df[best].fillna("General")

    # Merchant inference
    merch_col = _pick_column(df, COLUMN_ALIASES["merchant"])
    if merch_col:
        df["merchant"] = df[merch_col]
    elif "merchant" not in df.columns:
        text_cols = df.select_dtypes(include=["object"]).columns.tolist()
        if text_cols:
            counts = {c: df[c].nunique(dropna=True) for c in text_cols}
            best = max(counts, key=lambda k: counts[k])
            df["merchant"] = df[best].fillna("Unknown")

    # Country inference
    country_col = _pick_column(df, COLUMN_ALIASES["country"])
    if country_col:
        df["country"] = df[country_col]
    elif "country" not in df.columns:
        df["country"] = "Unknown"

    # User ID inference
    user_col = _pick_column(df, COLUMN_ALIASES["user_id"])
    if user_col:
        df["user_id"] = df[user_col]
    elif "user_id" not in df.columns:
        df["user_id"] = "user-1"

    # Fallbacks to avoid empty frames
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
    """
    Here I load an Excel file containing transaction records and enforce
    a simple schema contract. If anything critical is missing, I raise
    a clear ValueError so that the UI can surface a friendly message.

    Parameters
    ----------
    path:
        Path to the Excel file on disk.

    Returns
    -------
    pandas.DataFrame
        DataFrame that contains at least the REQUIRED_COLUMNS.
    """
    file_path = Path(path)
    if not file_path.exists():
        raise FileNotFoundError(f"I expected the file '{file_path}' to exist.")

    try:
        if file_path.suffix.lower() in (".xlsx", ".xls"):
            frames: List[pd.DataFrame] = []
            try:
                xls = pd.ExcelFile(file_path)
                for sheet in xls.sheet_names:
                    for header in range(0, 6):
                        try:
                            frames.append(xls.parse(sheet, header=header))
                        except Exception:
                            continue
            except Exception:
                frames = []
            if frames:
                df_raw = _best_frame(frames)
            else:
                df_raw = pd.read_excel(file_path)
        else:
            frames = []
            encodings = ["utf-8-sig", "utf-8", "latin1"]
            for enc in encodings:
                for header in range(0, 4):
                    try:
                        frames.append(pd.read_csv(file_path, encoding=enc, header=header))
                    except Exception:
                        continue
            if frames:
                df_raw = _best_frame(frames)
            else:
                df_raw = pd.read_csv(file_path, sep=None, engine="python")
    except Exception as exc:  # pragma: no cover - defensive
        raise ValueError(f"I could not read the input file: {exc}") from exc

    df_raw = df_raw.dropna(axis=0, how="all").dropna(axis=1, how="all")
    df_raw = _infer_columns(df_raw)
    return df_raw


__all__ = ["load_transactions_excel", "REQUIRED_COLUMNS"]
