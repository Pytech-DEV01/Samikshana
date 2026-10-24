import pandas as pd

from src.config import PROGRESS_GAP_THRESHOLD_PP


def detect_progress(
    project,
    threshold_pp=PROGRESS_GAP_THRESHOLD_PP,
):
    required = [
        "sanctioned_cost",
        "actual_expenditure",
        "physical_progress_pct",
    ]

    missing = [
        field for field in required
        if field not in project or pd.isna(project[field])
    ]

    if missing:
        return {
            "detector": "progress",
            "status": "insufficient_data",
            "reasons": [f"Missing values: {missing}"],
            "evidence": {},
        }

    sanction = float(project["sanctioned_cost"])
    expenditure = float(project["actual_expenditure"])
    physical = float(project["physical_progress_pct"])

    if (
        sanction <= 0
        or expenditure < 0
        or not 0 <= physical <= 100
    ):
        return {
            "detector": "progress",
            "status": "insufficient_data",
            "reasons": ["Invalid cost or progress values"],
            "evidence": {},
        }

    financial = expenditure / sanction * 100
    gap = financial - physical
    flagged = gap >= threshold_pp

    return {
        "detector": "progress",
        "status": "flagged" if flagged else "clear",
        "risk_score": min(100, round(max(0, gap))),
        "reasons": [
            f"Financial progress exceeds physical progress "
            f"by {gap:.1f} percentage points"
            if flagged else
            "Progress gap is below the configured threshold"
        ],
        "evidence": {
            "financial_progress_pct": round(financial, 2),
            "physical_progress_pct": physical,
            "gap_percentage_points": round(gap, 2),
        },
        "limitations": [
            "Advance payments and materials purchased but not yet "
            "installed may explain the difference."
        ],
    }