"""
In this module, I implement the data ingestion layer for the KAVACH platform.
I focus on loading Excel transaction files, validating schema, and returning
clean pandas DataFrames that the rest of the pipeline can safely consume.
"""

from __future__ import annotations

from pathlib import Path
from typing import Iterable, List

import pandas as pd


REQUIRED_COLUMNS: List[str] = [
    "user_id",
    "amount",
    "category",
    "merchant",
    "country",
    "timestamp",
]


def _normalize_columns(columns: Iterable[str]) -> List[str]:
    """
    In this helper, I normalize column names by stripping spaces
    and lower‑casing everything so that the ingestion step is a bit
    more forgiving about minor formatting differences.
    """
    return [str(c).strip().lower() for c in columns]


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
        if file_path.suffix.lower() == ".csv":
            df_raw = pd.read_csv(file_path)
        else:
            df_raw = pd.read_excel(file_path)
    except Exception as exc:  # pragma: no cover - defensive
        raise ValueError(f"I could not read the input file: {exc}") from exc

    # I normalize columns and then align them to the required names.
    normalized = _normalize_columns(df_raw.columns)
    df_raw.columns = normalized

    missing = [col for col in REQUIRED_COLUMNS if col not in normalized]
    if missing:
        raise ValueError(
            "The uploaded file is missing required columns that I rely on: "
            + ", ".join(missing)
        )

    # I subset to at least the required columns; extra columns are preserved.
    # This gives me a predictable minimum schema but still allows flexibility.
    return df_raw


__all__ = ["load_transactions_excel", "REQUIRED_COLUMNS"]
