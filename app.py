import argparse
import json
from pathlib import Path

from src.config import DEFAULT_DATA_DIR, REPORTS_DIR
from src.data_loader import load_bundle
from src.preprocessing import normalize_projects
from src.risk_engine import assess_all


def run_pipeline(data_dir=DEFAULT_DATA_DIR):
    """Load, normalize, and assess all project datasets."""
    bundle = load_bundle(data_dir)
    projects = normalize_projects(bundle["projects"])

    report = assess_all(
        projects,
        bundle["boq"],
        bundle["tenders"],
        bundle["contractor_history"],
    )
    report["input_project_count"] = int(len(projects))
    return report


def save_report(report, output_path):
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(report, indent=2, default=str),
        encoding="utf-8",
    )
    return output_path


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Run the MPLADS project-risk assessment pipeline."
    )
    parser.add_argument(
        "--data-dir",
        default=str(DEFAULT_DATA_DIR),
        help="Folder containing the project CSV datasets",
    )
    parser.add_argument(
        "--output",
        default=str(REPORTS_DIR / "risk_report.json"),
        help="Path for the generated JSON risk report",
    )
    args = parser.parse_args(argv)

    report = run_pipeline(args.data_dir)
    output_path = save_report(report, args.output)

    print(f"Projects processed: {report['input_project_count']}")
    print(f"Report saved to: {output_path}")


if __name__ == "__main__":
    main()
