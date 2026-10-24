from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]

DEFAULT_DATA_DIR = ROOT_DIR / "data"
REPORTS_DIR = ROOT_DIR / "reports"

# Prototype thresholds — validate these against real records.
DUPLICATE_RADIUS_METRES = 500
DUPLICATE_TEXT_SIMILARITY = 0.55
PROGRESS_GAP_THRESHOLD_PP = 25
BOQ_VARIANCE_THRESHOLD_PCT = 20
PEER_COST_VARIANCE_THRESHOLD_PCT = 30
