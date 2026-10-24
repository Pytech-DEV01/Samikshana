from pathlib import Path
import pandas as pd


def load_csv_if_exists(path):
    path = Path(path)

    if path.exists():
        try:
            return pd.read_csv(path)
        except pd.errors.EmptyDataError:
            return pd.DataFrame()

    return pd.DataFrame()


def load_bundle(data_dir):
    data_dir = Path(data_dir)

    projects_path = data_dir / "projects.csv"

    if not projects_path.exists():
        raise FileNotFoundError(
            f"Required dataset not found: {projects_path}"
        )

    return {
        "projects": pd.read_csv(projects_path),
        "boq": load_csv_if_exists(data_dir / "boq.csv"),
        "tenders": load_csv_if_exists(data_dir / "tenders.csv"),
        "contractor_history": load_csv_if_exists(
            data_dir / "contractor_history.csv"
        ),
    }