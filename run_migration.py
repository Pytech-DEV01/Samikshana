"""Apply the complete Sahayog schema to Supabase PostgreSQL."""

import os
from pathlib import Path
from urllib.parse import urlsplit

import psycopg2 as psycopg
from dotenv import load_dotenv


ROOT_DIR = Path(__file__).resolve().parent
MIGRATION_FILES = (
    ROOT_DIR / "supabase" / "migrations" / "002_complete_schema.sql",
    ROOT_DIR / "supabase" / "migrations" / "003_keycloak_review_identity.sql",
    ROOT_DIR / "supabase" / "migrations" / "004_project_reviews_and_messages.sql",
)


def get_connection_settings():
    database_url = os.environ.get("SUPABASE_DB_URL")
    if database_url:
        return {
            **psycopg.conninfo.conninfo_to_dict(database_url),
            "sslmode": "require",
            "connect_timeout": 15,
        }

    database_password = os.environ.get("SUPABASE_DB_PASSWORD")
    supabase_url = os.environ.get("SUPABASE_URL")
    if not database_password or not supabase_url:
        raise RuntimeError(
            "Set SUPABASE_DB_PASSWORD and SUPABASE_URL in .env, or set "
            "SUPABASE_DB_URL. The Supabase API keys are not database passwords."
        )

    project_ref = urlsplit(supabase_url).hostname.split(".", 1)[0]
    return {
        "host": f"db.{project_ref}.supabase.co",
        "port": 5432,
        "dbname": "postgres",
        "user": "postgres",
        "password": database_password,
        "sslmode": "require",
        "connect_timeout": 15,
    }


def run_migration():
    load_dotenv(ROOT_DIR / ".env")
    with psycopg.connect(**get_connection_settings()) as connection:
        for migration_file in MIGRATION_FILES:
            sql = migration_file.read_text(encoding="utf-8")
            connection.execute(sql, prepare=False)

    print(
        "Supabase schema applied successfully from "
        + ", ".join(migration_file.name for migration_file in MIGRATION_FILES)
        + "."
    )


if __name__ == "__main__":
    run_migration()
