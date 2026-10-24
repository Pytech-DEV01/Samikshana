import pandas as pd


def detect_expenditure(project):
    required = ["sanctioned_cost", "actual_expenditure"]

    missing = [
        field for field in required
        if field not in project or pd.isna(project[field])
    ]

    if missing:
        return {
            "detector": "expenditure",
            "status": "insufficient_data",
            "reasons": [f"Missing values: {missing}"],
            "evidence": {},
        }

    sanctioned = float(project["sanctioned_cost"])
    spent = float(project["actual_expenditure"])

    if sanctioned <= 0 or spent < 0:
        return {
            "detector": "expenditure",
            "status": "insufficient_data",
            "reasons": ["Invalid sanction or expenditure value"],
            "evidence": {},
        }

    difference = spent - sanctioned
    percentage = spent / sanctioned * 100
    flagged = difference > 0

    return {
        "detector": "expenditure",
        "status": "flagged" if flagged else "clear",
        "risk_score": min(100, round(max(0, percentage - 100))),
        "reasons": [
            "Expenditure exceeds recorded sanction"
            if flagged else
            "No expenditure overrun against recorded sanction"
        ],
        "evidence": {
            "sanctioned_cost": sanctioned,
            "actual_expenditure": spent,
            "excess_amount": round(max(0, difference), 2),
            "expenditure_percentage": round(percentage, 2),
            "requested_amount": project.get("requested_amount"),
        },
        "limitations": [
            "Check revised sanctions, approved variations, refunds "
            "and accounting periods."
        ],
    }