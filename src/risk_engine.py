import pandas as pd

from src.detectors.duplicate_detector import detect_duplicates
from src.detectors.expenditure_detector import detect_expenditure
from src.detectors.progress_detector import detect_progress
from src.detectors.cost_detector import (
    compare_boq_costs,
    compare_similar_projects,
)
from src.detectors.tender_detector import analyze_tenders
from src.detectors.contractor_detector import (
    analyze_contractor_history,
)


def assess_all(
    projects,
    boq=None,
    tenders=None,
    contractor_history=None,
):
    boq = boq if boq is not None else pd.DataFrame()
    tenders = tenders if tenders is not None else pd.DataFrame()
    history = (
        contractor_history
        if contractor_history is not None
        else pd.DataFrame()
    )

    duplicate_results = detect_duplicates(projects)
    project_reports = []

    for project in projects.to_dict("records"):
        results = [
            detect_expenditure(project),
            detect_progress(project),
            compare_similar_projects(project, projects),
        ]

        if "project_id" in boq.columns:
            project_boq = boq[
                boq["project_id"].astype(str)
                == str(project.get("project_id"))
            ]
        else:
            project_boq = pd.DataFrame()

        results.append(compare_boq_costs(project_boq))

        contractor_id = project.get("contractor_id")

        if (
            contractor_id is not None
            and not pd.isna(contractor_id)
            and str(contractor_id).strip()
        ):
            results.append(
                analyze_contractor_history(history, contractor_id)
            )

        project_reports.append({
            "project_id": str(project.get("project_id", "")),
            "results": results,
        })

    return {
        "duplicate_candidates": duplicate_results,
        "projects": project_reports,
        "tender_review": analyze_tenders(tenders),
        "note": (
            "Prototype review signals only. A flag is not proof "
            "of fraud or a calibrated probability."
        ),
    }