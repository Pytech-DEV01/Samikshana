import pandas as pd

NUMERIC_COLUMNS = [
    "latitude",
    "longitude",
    "sanctioned_cost",
    "actual_expenditure",
    "requested_amount",
    "physical_progress_pct",
]


def normalize_projects(df):
    out = df.copy()

    # Standardize column names.
    out.columns = [
        str(column).strip().lower()
        for column in out.columns
    ]

    # Convert numeric fields.
    for column in NUMERIC_COLUMNS:
        if column in out.columns:
            out[column] = pd.to_numeric(
                out[column],
                errors="coerce",
            )

    # Validate completion percentage.
    if "physical_progress_pct" in out.columns:
        invalid = ~out["physical_progress_pct"].between(0, 100)

        out.loc[
            invalid, "physical_progress_pct"
        ] = float("nan")

    # Remove duplicate project IDs, keeping the first record.
    if "project_id" in out.columns:
        out = out.drop_duplicates(
            subset=["project_id"],
            keep="first",
        )

    return out