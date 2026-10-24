import pandas as pd


def analyze_contractor_history(history, contractor_id):
    required = {
        "contractor_id",
        "planned_end_date",
        "actual_end_date",
    }

    if (
        history is None
        or history.empty
        or not required.issubset(history.columns)
    ):
        return {
            "detector": "contractor_history",
            "status": "insufficient_data",
            "reasons": ["Contractor history is unavailable or incomplete"],
            "evidence": {},
        }

    df = history[
        history["contractor_id"].astype(str)
        == str(contractor_id)
    ].copy()

    if df.empty:
        return {
            "detector": "contractor_history",
            "status": "insufficient_data",
            "reasons": ["No history found for this contractor"],
            "evidence": {"contractor_id": str(contractor_id)},
        }

    planned = pd.to_datetime(
        df["planned_end_date"], errors="coerce"
    )
    actual = pd.to_datetime(
        df["actual_end_date"], errors="coerce"
    )

    completed = planned.notna() & actual.notna()
    late = completed & (actual > planned)

    def count_true(column):
        if column not in df.columns:
            return 0

        return int(
            df[column].astype(str).str.lower()
            .isin(["true", "1", "yes", "y"]).sum()
        )

    late_count = int(late.sum())
    completed_count = int(completed.sum())
    penalties = count_true("penalty_recorded")
    failures = count_true("quality_failure_recorded")
    terminations = count_true("terminated")

    signals = late_count + penalties + failures + terminations

    return {
        "detector": "contractor_history",
        "status": "review" if signals else "clear",
        "risk_score": min(100, signals * 20),
        "reasons": [
            "Historical records contain review signals"
            if signals else
            "No configured historical signals found"
        ],
        "evidence": {
            "contractor_id": str(contractor_id),
            "records": len(df),
            "completed_projects_with_dates": completed_count,
            "late_projects": late_count,
            "late_rate_pct": (
                round(late_count / completed_count * 100, 2)
                if completed_count else None
            ),
            "recorded_penalties": penalties,
            "recorded_quality_failures": failures,
            "recorded_terminations": terminations,
        },
        "limitations": [
            "Verify the records and consider contract extensions, "
            "appeals, contract size and incomplete history."
        ],
    }