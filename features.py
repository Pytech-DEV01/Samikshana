import numpy as np
import pandas as pd

FEATURE_COLUMNS = [
    "financial_progress_pct",
    "physical_progress_pct",
    "progress_gap_pct",
]


def prepare_features(df):
    required = [
        "sanctioned_cost",
        "actual_expenditure",
        "physical_progress_pct",
    ]

    missing = [c for c in required if c not in df.columns]
    if missing:
        raise ValueError(f"Missing required columns: {missing}")

    cost = pd.to_numeric(df["sanctioned_cost"], errors="coerce")
    expenditure = pd.to_numeric(
        df["actual_expenditure"], errors="coerce"
    )
    progress = pd.to_numeric(
        df["physical_progress_pct"], errors="coerce"
    )

    # Invalid costs cannot produce a meaningful financial ratio.
    valid_cost = cost.where(cost > 0)

    financial_progress = (
        expenditure / valid_cost * 100
    ).replace([np.inf, -np.inf], np.nan)

    result = pd.DataFrame(index=df.index)
    result["financial_progress_pct"] = financial_progress
    result["physical_progress_pct"] = progress
    result["progress_gap_pct"] = (
        financial_progress - progress
    )

    # Reject impossible physical progress values.
    result.loc[
        ~result["physical_progress_pct"].between(0, 100),
        "physical_progress_pct",
    ] = np.nan

    return result[FEATURE_COLUMNS]