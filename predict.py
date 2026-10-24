import json
import pandas as pd

from src.risk_engine import assess_all
from src.preprocessing import normalize_projects


def predict_project(
    project,
    projects,
    boq=None,
    tenders=None,
    contractor_history=None,
):
    projects = normalize_projects(projects)

    report = assess_all(
        projects,
        boq if boq is not None else pd.DataFrame(),
        tenders if tenders is not None else pd.DataFrame(),
        contractor_history
        if contractor_history is not None
        else pd.DataFrame(),
    )

    project_id = str(project["project_id"])

    selected = [
        item for item in report["projects"]
        if item["project_id"] == project_id
    ]

    return {
        "project_id": project_id,
        "project_assessment": selected,
        "duplicate_candidates": [
            candidate
            for candidate in report["duplicate_candidates"]
            if candidate.get("project_id") == project_id
            or candidate.get("evidence", {}).get(
                "candidate_project_id"
            ) == project_id
        ],
        "tender_review": report["tender_review"],
        "note": report["note"],
    }


if __name__ == "__main__":
    print(
        "Import predict_project() and pass a project record "
        "plus the relevant datasets."
    )