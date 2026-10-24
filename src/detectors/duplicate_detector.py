from itertools import combinations
import math

from rapidfuzz.fuzz import token_set_ratio

from src.config import (
    DUPLICATE_RADIUS_METRES,
    DUPLICATE_TEXT_SIMILARITY,
)


def haversine_metres(lat1, lon1, lat2, lon2):
    """Calculate distance between two latitude/longitude points."""
    earth_radius = 6_371_000

    lat1, lat2 = math.radians(lat1), math.radians(lat2)
    delta_lat = lat2 - lat1
    delta_lon = math.radians(lon2 - lon1)

    a = (
        math.sin(delta_lat / 2) ** 2
        + math.cos(lat1)
        * math.cos(lat2)
        * math.sin(delta_lon / 2) ** 2
    )

    return 2 * earth_radius * math.asin(
        min(1, math.sqrt(a))
    )


def detect_duplicates(
    projects,
    radius_metres=DUPLICATE_RADIUS_METRES,
    text_threshold=DUPLICATE_TEXT_SIMILARITY,
):
    required = {
        "project_id", "project_name", "latitude", "longitude"
    }

    missing = required - set(projects.columns)

    if missing:
        return [{
            "detector": "duplicate",
            "status": "insufficient_data",
            "reasons": [f"Missing columns: {sorted(missing)}"],
            "evidence": {},
        }]

    rows = projects.dropna(
        subset=["project_name", "latitude", "longitude"]
    ).to_dict("records")

    matches = []

    for a, b in combinations(rows, 2):
        if str(a["project_id"]) == str(b["project_id"]):
            continue

        distance = haversine_metres(
            float(a["latitude"]),
            float(a["longitude"]),
            float(b["latitude"]),
            float(b["longitude"]),
        )

        similarity = token_set_ratio(
            str(a["project_name"]),
            str(b["project_name"]),
        ) / 100

        if (
            distance <= radius_metres
            and similarity >= text_threshold
        ):
            matches.append({
                "detector": "duplicate",
                "status": "flagged",
                "risk_score": round(
                    45 + similarity * 35
                ),
                "project_id": str(a["project_id"]),
                "reasons": [
                    "Nearby project locations",
                    "Similar project descriptions",
                ],
                "evidence": {
                    "candidate_project_id": str(b["project_id"]),
                    "distance_metres": round(distance, 1),
                    "name_similarity": round(similarity, 3),
                },
                "limitations": [
                    "Verify scope, dates, location, asset and funding "
                    "before treating this as a duplicate."
                ],
            })

    return matches or [{
        "detector": "duplicate",
        "status": "clear",
        "risk_score": 0,
        "reasons": ["No pairs met the configured thresholds"],
        "evidence": {"projects_checked": len(rows)},
    }]