import pandas as pd

from src.config import (
    BOQ_VARIANCE_THRESHOLD_PCT,
    PEER_COST_VARIANCE_THRESHOLD_PCT,
)


def compare_boq_costs(boq, threshold_pct=BOQ_VARIANCE_THRESHOLD_PCT):
    required = {"quantity", "unit_rate", "reference_rate"}

    if boq is None or boq.empty or not required.issubset(boq.columns):
        return {
            "detector": "material_cost",
            "status": "insufficient_data",
            "reasons": [
                "BOQ requires quantity, unit_rate and reference_rate"
            ],
            "evidence": {},
        }

    df = boq.copy()

    for column in required:
        df[column] = pd.to_numeric(
            df[column], errors="coerce"
        )

    df = df.dropna(subset=list(required))
    df = df[
        (df["quantity"] >= 0)
        & (df["unit_rate"] >= 0)
        & (df["reference_rate"] > 0)
    ]

    if df.empty:
        return {
            "detector": "material_cost",
            "status": "insufficient_data",
            "reasons": ["No valid BOQ rows"],
            "evidence": {},
        }

    submitted_total = (
        df["quantity"] * df["unit_rate"]
    ).sum()

    reference_total = (
        df["quantity"] * df["reference_rate"]
    ).sum()

    variance = (
        (submitted_total - reference_total)
        / reference_total
        * 100
    )

    flagged = variance > threshold_pct

    return {
        "detector": "material_cost",
        "status": "flagged" if flagged else "clear",
        "risk_score": min(100, round(max(0, variance))),
        "reasons": [
            f"BOQ total is {variance:.1f}% above reference rates"
            if flagged else
            "BOQ total is within the configured threshold"
        ],
        "evidence": {
            "submitted_total": round(float(submitted_total), 2),
            "reference_total": round(float(reference_total), 2),
            "variance_pct": round(float(variance), 2),
            "items_checked": len(df),
        },
        "limitations": [
            "Reference prices must match material grade, unit, "
            "location and date."
        ],
    }


def compare_similar_projects(
    project,
    projects,
    threshold_pct=PEER_COST_VARIANCE_THRESHOLD_PCT,
):
    required = {"work_type", "sanctioned_cost"}

    if not required.issubset(projects.columns):
        return {
            "detector": "location_cost",
            "status": "insufficient_data",
            "reasons": ["Missing work_type or sanctioned_cost"],
            "evidence": {},
        }

    if pd.isna(project.get("sanctioned_cost")):
        return {
            "detector": "location_cost",
            "status": "insufficient_data",
            "reasons": ["Project sanction is missing"],
            "evidence": {},
        }

    work_type = str(project.get("work_type", "")).lower()

    peers = projects[
        projects["work_type"].astype(str).str.lower() == work_type
    ].copy()

    peers["sanctioned_cost"] = pd.to_numeric(
        peers["sanctioned_cost"], errors="coerce"
    )
    peers = peers.dropna(subset=["sanctioned_cost"])

    if "project_id" in peers.columns:
        peers = peers[
            peers["project_id"].astype(str)
            != str(project.get("project_id"))
        ]

    if len(peers) < 3:
        return {
            "detector": "location_cost",
            "status": "insufficient_data",
            "reasons": [
                "Fewer than three comparable projects are available"
            ],
            "evidence": {"peer_count": len(peers)},
            "limitations": [
                "Total cost alone is not a fair comparison. "
                "Normalize by quantity, specification, year and location."
            ],
        }

    median_cost = float(peers["sanctioned_cost"].median())
    project_cost = float(project["sanctioned_cost"])

    if median_cost <= 0:
        return {
            "detector": "location_cost",
            "status": "insufficient_data",
            "reasons": ["Peer median cost is invalid"],
            "evidence": {},
        }

    variance = (project_cost - median_cost) / median_cost * 100
    flagged = variance > threshold_pct

    return {
        "detector": "location_cost",
        "status": "flagged" if flagged else "clear",
        "risk_score": min(100, round(max(0, variance))),
        "reasons": [
            f"Project sanction is {variance:.1f}% above peer median"
            if flagged else
            "Project sanction is within the configured peer threshold"
        ],
        "evidence": {
            "project_cost": project_cost,
            "peer_median_cost": median_cost,
            "variance_pct": round(variance, 2),
            "peer_count": len(peers),
        },
        "limitations": [
            "This is a preliminary comparison, not a location-adjusted "
            "construction cost estimate."
        ],
    }