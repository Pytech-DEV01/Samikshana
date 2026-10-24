import argparse
import json

from src.config import DEFAULT_DATA_DIR, REPORTS_DIR
from src.data_loader import load_bundle
from src.preprocessing import normalize_projects
from src.risk_engine import assess_all


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--data-dir",
        default=str(DEFAULT_DATA_DIR),
        help="Folder containing your CSV datasets",
    )
    args = parser.parse_args()

    bundle = load_bundle(args.data_dir)

    projects = normalize_projects(bundle["projects"])

    report = assess_all(
        projects,
        bundle["boq"],
        bundle["tenders"],
        bundle["contractor_history"],
    )

    report["input_project_count"] = int(len(projects))

    REPORTS_DIR.mkdir(parents=True, exist_ok=True)

    output_path = REPORTS_DIR / "risk_report.json"
    output_path.write_text(
        json.dumps(report, indent=2, default=str),
        encoding="utf-8",
    )

    print(f"Projects processed: {len(projects)}")
    print(f"Report saved to: {output_path}")


if __name__ == "__main__":
    main()