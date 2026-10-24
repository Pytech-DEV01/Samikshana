import os

import pandas as pd
from sqlalchemy import create_engine, text


def get_engine():
    database_url = os.getenv("DATABASE_URL")

    if not database_url:
        raise RuntimeError(
            "Set DATABASE_URL before using the PostGIS service."
        )

    return create_engine(database_url, pool_pre_ping=True)


def setup_schema(engine):
    statements = [
        "CREATE EXTENSION IF NOT EXISTS postgis",
        """
        CREATE TABLE IF NOT EXISTS projects (
            project_id TEXT PRIMARY KEY,
            project_name TEXT,
            work_type TEXT,
            district TEXT,
            sanctioned_cost NUMERIC,
            actual_expenditure NUMERIC,
            physical_progress_pct NUMERIC,
            location GEOGRAPHY(POINT, 4326)
        )
        """,
        """
        CREATE INDEX IF NOT EXISTS projects_location_gix
        ON projects USING GIST (location)
        """,
    ]

    with engine.begin() as connection:
        for statement in statements:
            connection.execute(text(statement))


def nearby_project_pairs(radius_metres=500):
    query = text("""
        SELECT
            a.project_id AS project_a,
            b.project_id AS project_b,
            a.project_name AS name_a,
            b.project_name AS name_b,
            ST_Distance(a.location, b.location) AS distance_metres
        FROM projects a
        JOIN projects b
          ON a.project_id < b.project_id
         AND ST_DWithin(a.location, b.location, :radius)
        WHERE a.location IS NOT NULL
          AND b.location IS NOT NULL
        ORDER BY distance_metres
    """)

    engine = get_engine()

    with engine.connect() as connection:
        return pd.read_sql(
            query,
            connection,
            params={"radius": radius_metres},
        )