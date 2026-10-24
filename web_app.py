"""Run the Sahayog web interface with Keycloak OpenID Connect sign-in."""

import csv
import json
import logging
import math
import os
import re
import secrets
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen

from authlib.common.security import generate_token
from authlib.integrations.base_client.errors import OAuthError
from authlib.integrations.flask_client import OAuth
from dotenv import load_dotenv
from flask import (
    Flask,
    abort,
    current_app,
    jsonify,
    redirect,
    request,
    send_from_directory,
    session,
)
from werkzeug.utils import secure_filename

from supabase_store import SupabaseStore, SupabaseStoreError


ROOT_DIR = Path(__file__).resolve().parent
WEB_DIR = ROOT_DIR / "web"
load_dotenv(ROOT_DIR / ".env")

ROLES = {
    "citizen": {
        "label": "Citizen",
        "shortName": "Citizen",
        "access": "View only",
        "contractorId": None,
    },
    "mp": {
        "label": "MP / Authority",
        "shortName": "MP / Authority",
        "access": "Full control",
        "contractorId": None,
    },
    "contractor": {
        "label": "Contractor",
        "shortName": "Contractor",
        "access": "Assigned works",
        "contractorId": None,
    },
    "district_authority": {
        "label": "District Authority",
        "shortName": "District Authority",
        "access": "District scope",
        "contractorId": None,
    },
    "state_authority": {
        "label": "State Authority",
        "shortName": "State Authority",
        "access": "State scope",
        "contractorId": None,
    },
    "nodal_officer": {
        "label": "Nodal Officer",
        "shortName": "Nodal Officer",
        "access": "National scope",
        "contractorId": None,
    },
    "ministry": {
        "label": "MoSPI / Ministry",
        "shortName": "MoSPI / Ministry",
        "access": "National scope",
        "contractorId": None,
    },
    "application_reviewer": {
        "label": "Account Reviewer",
        "shortName": "Account Reviewer",
        "access": "Application review",
        "contractorId": None,
    },
}

REGISTRABLE_ROLES = {
    "mp",
    "contractor",
    "state_authority",
    "district_authority",
    "nodal_officer",
    "ministry",
}
ALLOWED_DOCUMENT_TYPES = {
    ".pdf": (b"%PDF-", "application/pdf"),
    ".png": (b"\x89PNG\r\n\x1a\n", "image/png"),
    ".jpg": (b"\xff\xd8\xff", "image/jpeg"),
    ".jpeg": (b"\xff\xd8\xff", "image/jpeg"),
}
MAX_DOCUMENT_BYTES = 5 * 1024 * 1024
PROJECT_AUTHORITY_ROLES = {
    "mp",
    "state_authority",
    "district_authority",
    "nodal_officer",
    "ministry",
}
PROJECT_REPORT_ROLES = PROJECT_AUTHORITY_ROLES | {"contractor"}


def get_supabase_store():
    url = current_app.config.get("SUPABASE_URL", "").strip()
    secret_key = current_app.config.get("SUPABASE_SECRET_KEY", "").strip()
    if not url and not secret_key:
        return None
    if not url or not secret_key:
        raise SupabaseStoreError(
            "Set both SUPABASE_URL and SUPABASE_SECRET_KEY on the server."
        )
    return SupabaseStore(url, secret_key)


def sync_approved_profile_to_supabase(store, application, profile):
    subject = application["keycloak_user_id"]
    profile_fields = {
        "email": application["email"],
        "full_name": application["full_name"],
        "phone": application["phone"],
        "role": application["role"],
        "state": profile.get("state") or None,
        "district": profile.get("district") or None,
        "constituency": profile.get("constituency") or None,
        "house": profile.get("house") or None,
        "department": profile.get("department") or None,
        "designation": profile.get("designation") or None,
        "company_name": profile.get("company_name") or None,
        "business_registration": profile.get("business_registration") or None,
        "profile_json": profile,
    }
    identities = store.select(
        "user_identities",
        select="profile_id",
        provider="eq.keycloak",
        subject=f"eq.{subject}",
        limit=1,
    )
    if identities:
        profile_id = identities[0]["profile_id"]
        store.update(
            "user_profiles", {"id": f"eq.{profile_id}"}, profile_fields
        )
    else:
        created_profile = store.insert("user_profiles", profile_fields)
        profile_id = created_profile["id"]
        store.insert(
            "user_identities",
            {
                "profile_id": profile_id,
                "provider": "keycloak",
                "subject": subject,
            },
        )

    if application["role"] == "contractor":
        contractor_fields = {
            "email": application["email"],
            "full_name": application["full_name"],
            "phone": application["phone"],
            "company_name": profile.get("company_name") or None,
            "business_registration": profile.get("business_registration") or None,
            "state": profile.get("state") or None,
            "district": profile.get("district") or None,
            "is_active": True,
            "profile_json": profile,
        }
        contractors = store.select(
            "contractors",
            select="id",
            email=f'eq.{application["email"]}',
            limit=1,
        )
        if contractors:
            store.update(
                "contractors",
                {"id": f'eq.{contractors[0]["id"]}'},
                contractor_fields,
            )
        else:
            store.insert("contractors", contractor_fields)


@contextmanager
def get_database():
    connection = sqlite3.connect(current_app.config["APPLICATION_DATABASE"])
    connection.row_factory = sqlite3.Row
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def initialize_database(app):
    Path(app.config["APPLICATION_DATABASE"]).parent.mkdir(
        parents=True, exist_ok=True
    )
    with sqlite3.connect(app.config["APPLICATION_DATABASE"]) as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS account_applications (
                id TEXT PRIMARY KEY,
                role TEXT NOT NULL,
                email TEXT NOT NULL,
                keycloak_user_id TEXT,
                full_name TEXT NOT NULL,
                phone TEXT NOT NULL,
                profile_json TEXT NOT NULL,
                documents_json TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                created_at TEXT NOT NULL,
                reviewed_at TEXT,
                reviewed_by TEXT,
                review_note TEXT
            )
            """
        )
        application_columns = {
            row[1]
            for row in connection.execute(
                "PRAGMA table_info(account_applications)"
            )
        }
        if "keycloak_user_id" not in application_columns:
            connection.execute(
                "ALTER TABLE account_applications ADD COLUMN keycloak_user_id TEXT"
            )
        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS account_applications_status_created
            ON account_applications(status, created_at)
            """
        )
        connection.execute(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS one_pending_application_per_email_role
            ON account_applications(email, role) WHERE status = 'pending'
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS work_projects (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                sanctioned_amount REAL NOT NULL,
                start_date TEXT NOT NULL,
                end_date TEXT NOT NULL,
                mp_name TEXT NOT NULL,
                constituency TEXT NOT NULL,
                state TEXT NOT NULL,
                district TEXT NOT NULL,
                location TEXT NOT NULL,
                contractor_email TEXT NOT NULL,
                contractor_name TEXT NOT NULL,
                created_by_sub TEXT NOT NULL,
                created_by_email TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS work_projects_contractor
            ON work_projects(contractor_email, start_date)
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS work_reports (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL REFERENCES work_projects(id),
                report_date TEXT NOT NULL,
                completion_percent REAL NOT NULL,
                hours_worked REAL NOT NULL,
                materials TEXT NOT NULL,
                notes TEXT NOT NULL,
                latitude REAL NOT NULL,
                longitude REAL NOT NULL,
                submitted_by_email TEXT NOT NULL,
                photos_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                UNIQUE(project_id, report_date)
            )
            """
        )
        report_columns = {
            row[1] for row in connection.execute("PRAGMA table_info(work_reports)")
        }
        for column_name, column_sql in (
            ("review_status", "TEXT NOT NULL DEFAULT 'pending'"),
            ("reviewed_by_sub", "TEXT"),
            ("reviewed_at", "TEXT"),
            ("review_note", "TEXT"),
        ):
            if column_name not in report_columns:
                connection.execute(
                    f"ALTER TABLE work_reports ADD COLUMN {column_name} {column_sql}"
                )
        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS work_reports_project_date
            ON work_reports(project_id, report_date)
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS project_messages (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL REFERENCES work_projects(id) ON DELETE CASCADE,
                sender_sub TEXT NOT NULL,
                sender_email TEXT NOT NULL,
                sender_name TEXT NOT NULL,
                sender_role TEXT NOT NULL,
                message_type TEXT NOT NULL CHECK (
                    message_type IN (
                        'message', 'review', 'clarification_request',
                        'clarification_response'
                    )
                ),
                message TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS project_messages_project_created
            ON project_messages(project_id, created_at)
            """
        )


def request_is_same_origin():
    source = request.headers.get("Origin") or request.headers.get("Referer")
    expected_host = urlsplit(current_app.config["PUBLIC_BASE_URL"]).netloc
    return bool(source and urlsplit(source).netloc == expected_host)


def valid_csrf_token():
    supplied = request.headers.get("X-CSRF-Token") or request.form.get("csrf_token")
    expected = session.get("csrf_token", "")
    return bool(supplied and expected and secrets.compare_digest(supplied, expected))


def require_application_reviewer():
    identity = session.get("identity")
    if not identity or "application_reviewer" not in identity.get("roles", []):
        abort(403)


def project_visible_to_identity(project, identity):
    role = identity.get("role")
    if role == "contractor":
        return project["contractor_email"] == identity.get("email", "").casefold()
    if role == "mp":
        profile = identity.get("profile", {})
        return (
            project["state"].casefold() == (profile.get("state") or "").casefold()
            and project["constituency"].casefold()
            == (profile.get("constituency") or "").casefold()
            and bool(profile.get("state"))
            and bool(profile.get("constituency"))
        )
    if role == "district_authority":
        profile = identity.get("profile", {})
        return (
            project["state"].casefold()
            == (profile.get("state") or "").casefold()
            and project["district"].casefold()
            == (profile.get("district") or "").casefold()
            and bool(profile.get("state"))
            and bool(profile.get("district"))
        )
    if role == "state_authority":
        profile = identity.get("profile", {})
        return (
            project["state"].casefold() == (profile.get("state") or "").casefold()
            and bool(profile.get("state"))
        )
    return role in {"nodal_officer", "ministry"}


def project_report_response(project, connection):
    item = dict(project)
    item.pop("created_by_sub", None)
    item.pop("created_by_email", None)
    rows = connection.execute(
        """
        SELECT * FROM work_reports
        WHERE project_id = ? ORDER BY report_date DESC, created_at DESC
        """,
        (item["id"],),
    ).fetchall()
    item["reports"] = []
    for row in rows:
        report = dict(row)
        report.pop("submitted_by_email", None)
        report.pop("submitted_by_user_id", None)
        report.pop("reviewed_by_sub", None)
        photos = json.loads(report.pop("photos_json"))
        report["photos"] = [
            {
                "id": photo["id"],
                "filename": photo["filename"],
                "url": (
                    f'/api/projects/{item["id"]}/reports/'
                    f'{report["id"]}/photos/{photo["id"]}'
                ),
            }
            for photo in photos
        ]
        item["reports"].append(report)
    message_rows = connection.execute(
        """
        SELECT id, sender_name, sender_role, message_type, message, created_at
        FROM project_messages WHERE project_id = ? ORDER BY created_at, id
        """,
        (item["id"],),
    ).fetchall()
    item["messages"] = [dict(row) for row in message_rows]
    return item


def supabase_project_response(project, reports, messages):
    item = dict(project)
    item.pop("created_by_sub", None)
    item.pop("created_by_email", None)
    item["reports"] = []
    for row in reports:
        report = dict(row)
        report.pop("submitted_by_email", None)
        report.pop("submitted_by_user_id", None)
        report.pop("reviewed_by_sub", None)
        photos_json = report.pop("photos_json", [])
        photos = json.loads(photos_json) if isinstance(photos_json, str) else photos_json
        report["photos"] = [
            {
                "id": photo["id"],
                "filename": photo["filename"],
                "url": (
                    f'/api/projects/{item["id"]}/reports/'
                    f'{report["id"]}/photos/{photo["id"]}'
                ),
            }
            for photo in photos
        ]
        item["reports"].append(report)
    item["messages"] = [
        {
            key: message.get(key)
            for key in (
                "id",
                "sender_name",
                "sender_role",
                "message_type",
                "message",
                "created_at",
            )
        }
        for message in messages
    ]
    return item


def require_project_identity():
    identity = session.get("identity")
    if not identity or identity.get("role") not in PROJECT_REPORT_ROLES:
        abort(403)
    return identity


def require_authority_history_identity():
    identity = session.get("identity")
    if not identity or identity.get("role") not in PROJECT_AUTHORITY_ROLES:
        abort(403)
    return identity


def normalized_scope_value(value):
    return re.sub(r"[^a-z0-9]+", " ", str(value or "").casefold()).strip()


def historical_work_in_scope(work, identity):
    profile = identity.get("profile") or {}
    role = identity.get("role")
    state = normalized_scope_value(profile.get("state"))
    if role in {"mp", "state_authority", "district_authority"}:
        if not state or normalized_scope_value(work.get("state")) != state:
            return False
    if role == "mp":
        constituency = normalized_scope_value(profile.get("constituency"))
        return bool(constituency) and normalized_scope_value(
            work.get("constituency")
        ) == constituency
    if role == "district_authority":
        district = normalized_scope_value(profile.get("district"))
        implementing_authority = normalized_scope_value(work.get("ida"))
        return bool(district) and f" {district} " in f" {implementing_authority} "
    return True


def read_historical_works(dataset_directory, record_type):
    files = {
        "completed": (
            "mplads_completed_works_2026-10-24.csv",
            "Completed Date",
            "Final Amount (₹)",
        ),
        "recommended": (
            "mplads_recommended_works_2026-10-24.csv",
            "Recommendation Date",
            "Recommended Amount (₹)",
        ),
    }
    if record_type not in {"all", *files}:
        abort(400, description="Choose completed, recommended, or all work.")
    selected = files if record_type == "all" else {record_type: files[record_type]}
    for work_type, (filename, date_field, amount_field) in selected.items():
        path = Path(dataset_directory) / filename
        if not path.is_file():
            current_app.logger.error("Historical works export is missing: %s", path)
            abort(503, description="Historical works data is temporarily unavailable.")
        with path.open("r", encoding="utf-8-sig", newline="") as source:
            for row in csv.DictReader(source):
                yield {
                    "work_id": row.get("Work ID", ""),
                    "description": row.get("Work Description", ""),
                    "category": row.get("Category", ""),
                    "mp_name": row.get("MP Name", ""),
                    "constituency": row.get("Constituency", ""),
                    "state": row.get("State", ""),
                    "house": row.get("House", ""),
                    "amount": row.get(amount_field, ""),
                    "date": row.get(date_field, ""),
                    "ida": row.get("IDA", ""),
                    "type": work_type,
                }


def parse_iso_date(value):
    try:
        return date.fromisoformat(value)
    except (TypeError, ValueError):
        return None


def application_document_directory():
    directory = Path(current_app.config["APPLICATION_DOCUMENT_DIRECTORY"])
    directory.mkdir(parents=True, exist_ok=True)
    return directory


class KeycloakAdminError(RuntimeError):
    """A Keycloak account could not be provisioned or updated."""


class KeycloakAccountConflict(KeycloakAdminError):
    """The email address is already registered in Keycloak."""


def keycloak_admin_token():
    username = current_app.config.get("KEYCLOAK_ADMIN_USERNAME")
    password = current_app.config.get("KEYCLOAK_ADMIN_PASSWORD")
    if not username or not password:
        raise KeycloakAdminError(
            "Account provisioning is not configured. Contact the portal administrator."
        )

    issuer = current_app.config["KEYCLOAK_ISSUER"]
    server_url = issuer.split("/realms/", 1)[0]
    body = urlencode(
        {
            "grant_type": "password",
            "client_id": "admin-cli",
            "username": username,
            "password": password,
        }
    ).encode("utf-8")
    admin_request = Request(
        f"{server_url}/realms/master/protocol/openid-connect/token",
        data=body,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    try:
        with urlopen(admin_request, timeout=10) as response:
            result = json.loads(response.read())
    except (HTTPError, URLError, TimeoutError, ValueError) as error:
        current_app.logger.warning(
            "Could not obtain the Keycloak administration token: %s",
            type(error).__name__,
        )
        raise KeycloakAdminError(
            "Account provisioning is temporarily unavailable. Please try again later."
        ) from error
    access_token = result.get("access_token")
    if not access_token:
        raise KeycloakAdminError(
            "Account provisioning is temporarily unavailable. Please try again later."
        )
    return access_token


def keycloak_admin_request(token, method, path, payload=None):
    issuer = current_app.config["KEYCLOAK_ISSUER"]
    server_url, realm = issuer.split("/realms/", 1)
    realm_name = realm.split("/", 1)[0]
    realm_url = f"{server_url}/admin/realms/{realm_name}/"
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    headers = {"Authorization": "Bearer " + token}
    if body is not None:
        headers["Content-Type"] = "application/json"
    admin_request = Request(
        realm_url + path,
        data=body,
        headers=headers,
        method=method,
    )
    try:
        with urlopen(admin_request, timeout=10) as response:
            response_body = response.read()
            result = json.loads(response_body) if response_body else None
            return result, response.headers
    except HTTPError as error:
        if error.code == 404 and method == "DELETE":
            return None, error.headers
        if error.code == 409 and method == "POST" and path.endswith("/users"):
            raise KeycloakAccountConflict(
                "An account already exists for this email. Contact the portal reviewer."
            ) from error
        current_app.logger.warning(
            "Keycloak administration request failed with HTTP %s.",
            error.code,
        )
        raise KeycloakAdminError(
            "Account provisioning is temporarily unavailable. Please try again later."
        ) from error
    except (URLError, TimeoutError, ValueError) as error:
        current_app.logger.warning(
            "Keycloak administration request failed: %s",
            type(error).__name__,
        )
        raise KeycloakAdminError(
            "Account provisioning is temporarily unavailable. Please try again later."
        ) from error


def keycloak_user_details(token, user_id):
    result, _headers = keycloak_admin_request(
        token, "GET", f"users/{user_id}"
    )
    if not result:
        raise KeycloakAdminError(
            "The pending identity-provider account could not be found."
        )
    return result


def provision_pending_keycloak_account(email, full_name, password, profile):
    token = keycloak_admin_token()
    query = urlencode({"email": email, "exact": "true"})
    users, _headers = keycloak_admin_request(
        token, "GET", f"users?{query}"
    )
    if any(user.get("email", "").casefold() == email for user in users or []):
        raise KeycloakAccountConflict(
            "An account already exists for this email. Contact the portal reviewer."
        )

    user_attributes = {
        key: [value]
        for key, value in profile.items()
        if value
    }
    user_attributes["portal_application_pending"] = ["true"]
    _result, headers = keycloak_admin_request(
        token,
        "POST",
        "users",
        {
            "username": email,
            "email": email,
            "firstName": full_name,
            "emailVerified": False,
            "enabled": False,
            "attributes": user_attributes,
            "credentials": [
                {"type": "password", "value": password, "temporary": False}
            ],
        },
    )
    location = headers.get("Location", "")
    user_id = location.rstrip("/").split("/")[-1]
    if not user_id:
        users, _headers = keycloak_admin_request(
            token, "GET", f"users?{query}"
        )
        matching_users = [
            user for user in users or []
            if user.get("email", "").casefold() == email
        ]
        if len(matching_users) != 1 or not matching_users[0].get("id"):
            raise KeycloakAdminError(
                "The identity-provider account was created but could not be linked to its application."
            )
        user_id = matching_users[0]["id"]
    return user_id


def approve_pending_keycloak_account(user_id, role, profile):
    token = keycloak_admin_token()
    user = keycloak_user_details(token, user_id)
    if user.get("enabled"):
        current_roles, _headers = keycloak_admin_request(
            token, "GET", f"users/{user_id}/role-mappings/realm"
        )
        if not any(item.get("name") == role for item in current_roles or []):
            raise KeycloakAdminError(
                "The linked account is already active without the requested role. Contact the portal administrator."
            )

    realm_role, _headers = keycloak_admin_request(
        token, "GET", f"roles/{role}"
    )
    current_roles, _headers = keycloak_admin_request(
        token, "GET", f"users/{user_id}/role-mappings/realm"
    )
    if not any(item.get("name") == role for item in current_roles or []):
        keycloak_admin_request(
            token,
            "POST",
            f"users/{user_id}/role-mappings/realm",
            [realm_role],
        )

    attributes = user.get("attributes") or {}
    attributes.pop("portal_application_pending", None)
    attributes.update(
        {
            key: [value]
            for key, value in profile.items()
            if value
        }
    )
    user.update(
        {
            "enabled": True,
            "emailVerified": True,
            "attributes": attributes,
        }
    )
    keycloak_admin_request(
        token, "PUT", f"users/{user_id}", user
    )


def delete_pending_keycloak_account(user_id):
    token = keycloak_admin_token()
    user = keycloak_user_details(token, user_id)
    if user.get("enabled"):
        raise KeycloakAdminError(
            "The linked account is already active and was not deleted. Contact the portal administrator."
        )
    keycloak_admin_request(token, "DELETE", f"users/{user_id}")


def disable_pending_keycloak_account(user_id):
    token = keycloak_admin_token()
    user = keycloak_user_details(token, user_id)
    user["enabled"] = False
    keycloak_admin_request(token, "PUT", f"users/{user_id}", user)


def create_app(test_config=None):
    app = Flask(
        __name__,
        static_folder=str(WEB_DIR / "assets"),
        static_url_path="/assets",
    )
    app.config.from_mapping(
        SECRET_KEY=os.environ.get("SAHAYOG_SECRET_KEY"),
        KEYCLOAK_ISSUER=os.environ.get(
            "KEYCLOAK_ISSUER",
            "http://localhost:8080/realms/sahayog",
        ).rstrip("/"),
        KEYCLOAK_CLIENT_ID=os.environ.get(
            "KEYCLOAK_CLIENT_ID", "sahayog-web"
        ),
        SUPABASE_URL=os.environ.get("SUPABASE_URL", "").rstrip("/"),
        SUPABASE_PUBLISHABLE_KEY=os.environ.get(
            "SUPABASE_PUBLISHABLE_KEY", ""
        ),
        SUPABASE_SECRET_KEY=os.environ.get("SUPABASE_SECRET_KEY", ""),
        SUPABASE_JWKS_URL=os.environ.get("SUPABASE_JWKS_URL", ""),
        KEYCLOAK_ADMIN_USERNAME=os.environ.get("KEYCLOAK_ADMIN_USERNAME"),
        KEYCLOAK_ADMIN_PASSWORD=os.environ.get("KEYCLOAK_ADMIN_PASSWORD"),
        PUBLIC_BASE_URL=os.environ.get(
            "PUBLIC_BASE_URL", "http://localhost:5000"
        ).rstrip("/"),
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Lax",
        SESSION_COOKIE_SECURE=os.environ.get(
            "PUBLIC_BASE_URL", "http://localhost:5000"
        ).startswith("https://"),
        PERMANENT_SESSION_LIFETIME=timedelta(hours=8),
        MAX_CONTENT_LENGTH=27 * 1024 * 1024,
        HISTORICAL_WORKS_DIRECTORY=str(ROOT_DIR / "data" / "source_exports"),
    )
    if test_config:
        app.config.update(test_config)
    has_supabase_url = bool(app.config.get("SUPABASE_URL"))
    has_supabase_secret = bool(app.config.get("SUPABASE_SECRET_KEY"))
    if has_supabase_url != has_supabase_secret:
        raise RuntimeError(
            "Set both SUPABASE_URL and SUPABASE_SECRET_KEY to enable Supabase."
        )
    if not app.config.get("SECRET_KEY"):
        raise RuntimeError(
            "Set SAHAYOG_SECRET_KEY in the environment or the project .env file."
        )
    app.config.setdefault(
        "APPLICATION_DATABASE",
        str(Path(app.instance_path) / "account_applications.sqlite3"),
    )
    app.config.setdefault(
        "APPLICATION_DOCUMENT_DIRECTORY",
        str(Path(app.instance_path) / "application_documents"),
    )
    app.config.setdefault(
        "WORK_REPORT_PHOTO_DIRECTORY",
        str(Path(app.instance_path) / "work_report_photos"),
    )
    initialize_database(app)

    oauth = OAuth(app)
    oauth.register(
        name="keycloak",
        client_id=app.config["KEYCLOAK_CLIENT_ID"],
        server_metadata_url=(
            f'{app.config["KEYCLOAK_ISSUER"]}/.well-known/openid-configuration'
        ),
        client_kwargs={
            "scope": "openid profile email",
            "code_challenge_method": "S256",
            "token_endpoint_auth_method": "none",
        },
    )
    app.extensions["sahayog.oauth"] = oauth

    def identity_destination(identity):
        if identity.get("role") == "application_reviewer":
            preferred_role = next(
                (
                    role
                    for role in (
                        "mp",
                        "district_authority",
                        "state_authority",
                        "nodal_officer",
                        "ministry",
                        "contractor",
                    )
                    if role in identity.get("roles", [])
                ),
                None,
            )
            if preferred_role:
                role = ROLES[preferred_role]
                identity.update(
                    role=preferred_role,
                    roleLabel=role["label"],
                    access=role["access"],
                )
                session["identity"] = identity
            else:
                return redirect("/admin/applications")
        if identity.get("role") == "mp":
            return redirect("/dashboard.html")
        if identity.get("role") in PROJECT_REPORT_ROLES:
            return redirect("/projects")
        return redirect("/dashboard.html")

    @app.get("/")
    def index():
        identity = session.get("identity")
        if identity:
            return identity_destination(identity)
        response = send_from_directory(WEB_DIR, "index.html")
        response.headers["Cache-Control"] = "no-store"
        return response

    @app.get("/register")
    def register():
        response = send_from_directory(WEB_DIR, "register.html")
        response.direct_passthrough = False
        if "csrf_token" not in session:
            session["csrf_token"] = secrets.token_urlsafe(32)
        html = response.get_data(as_text=True)
        html = html.replace(
            '<meta name="csrf-token" content="">',
            f'<meta name="csrf-token" content="{session["csrf_token"]}">',
            1,
        )
        response.set_data(html)
        response.headers["Cache-Control"] = "no-store"
        return response

    @app.post("/api/account-applications")
    def create_account_application():
        if not request_is_same_origin() or not valid_csrf_token():
            abort(403, "This registration request could not be verified.")

        form = request.form
        role = form.get("role", "").strip()
        email = form.get("email", "").strip().casefold()
        full_name = form.get("full_name", "").strip()
        phone = form.get("phone", "").strip()
        password = form.get("password", "")
        password_confirmation = form.get("password_confirmation", "")
        if role not in REGISTRABLE_ROLES:
            return jsonify(error="Choose a supported account type."), 400
        if (
            len(email) > 254
            or not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email)
            or len(full_name) > 160
            or not full_name
            or len(phone) > 40
            or not phone
        ):
            return jsonify(error="Enter a valid email, full name, and phone number."), 400
        if len(password) < 12 or len(password) > 128:
            return jsonify(error="Choose a password between 12 and 128 characters."), 400
        if password != password_confirmation:
            return jsonify(error="The passwords do not match."), 400

        profile = {
            key: form.get(key, "").strip()
            for key in (
                "constituency",
                "state",
                "house",
                "locations",
                "office_address",
                "department",
                "designation",
                "district",
                "company_name",
                "business_registration",
            )
        }
        required_by_role = {
            "mp": ("constituency", "state", "house", "locations"),
            "contractor": ("company_name", "business_registration"),
            "state_authority": ("state", "department", "designation"),
            "district_authority": ("state", "district", "department", "designation"),
            "nodal_officer": ("department", "designation"),
            "ministry": ("department", "designation"),
        }
        required_fields = required_by_role[role]
        if any(not profile[field] for field in required_fields):
            return jsonify(error="Complete all required fields for this account type."), 400
        if any(len(value) > 2000 for value in profile.values()):
            return jsonify(error="A profile field exceeds the permitted length."), 400

        documents = request.files.getlist("documents")
        documents = [document for document in documents if document.filename]
        if len(documents) > 5:
            return jsonify(error="Upload no more than five supporting documents."), 400

        prepared_documents = []
        for document in documents:
            safe_name = secure_filename(document.filename)
            suffix = Path(safe_name).suffix.lower()
            file_info = ALLOWED_DOCUMENT_TYPES.get(suffix)
            if not safe_name or not file_info:
                return jsonify(error="Documents must be PDF, PNG, or JPEG files."), 400
            signature, _content_type = file_info
            content = document.stream.read(MAX_DOCUMENT_BYTES + 1)
            if len(content) > MAX_DOCUMENT_BYTES:
                return jsonify(error="Each document must be 5 MB or smaller."), 400
            if not content.startswith(signature):
                return jsonify(error=f"The uploaded file {safe_name} is not a valid {suffix} document."), 400
            document_id = uuid.uuid4().hex
            stored_name = f"{document_id}{suffix}"
            prepared_documents.append(
                {
                    "id": document_id,
                    "stored_name": stored_name,
                    "filename": safe_name[:200],
                    "content": content,
                }
            )

        stored_documents = [
            {key: value for key, value in document.items() if key != "content"}
            for document in prepared_documents
        ]
        application_id = str(uuid.uuid4())
        created_at = datetime.now(timezone.utc).isoformat()
        keycloak_user_id = None
        directory = application_document_directory()
        store = get_supabase_store()
        uploaded_document_paths = []
        remote_application_created = False
        try:
            with get_database() as connection:
                existing_application = connection.execute(
                    """
                    SELECT 1 FROM account_applications
                    WHERE email = ? AND role = ? AND status = 'pending'
                    """,
                    (email, role),
                ).fetchone()
            if store:
                remote_existing = store.select(
                    "account_applications",
                    select="id",
                    email=f"eq.{email}",
                    role=f"eq.{role}",
                    status="eq.pending",
                    limit=1,
                )
                existing_application = existing_application or bool(remote_existing)
            if existing_application:
                return jsonify(
                    error="There is already a pending application for this email and account type."
                ), 409

            keycloak_user_id = provision_pending_keycloak_account(
                email, full_name, password, profile
            )
            for document in prepared_documents:
                (directory / document["stored_name"]).write_bytes(document["content"])

            if store:
                remote_documents = []
                for document in prepared_documents:
                    suffix = Path(document["stored_name"]).suffix.lower()
                    storage_path = f"{application_id}/{document['stored_name']}"
                    store.upload(
                        "application-documents",
                        storage_path,
                        document["content"],
                        ALLOWED_DOCUMENT_TYPES[suffix][1],
                    )
                    uploaded_document_paths.append(storage_path)
                    remote_documents.append(
                        {
                            "id": document["id"],
                            "filename": document["filename"],
                            "mime_type": ALLOWED_DOCUMENT_TYPES[suffix][1],
                            "storage_path": storage_path,
                        }
                    )
                store.insert(
                    "account_applications",
                    {
                        "id": application_id,
                        "role": role,
                        "email": email,
                        "keycloak_user_id": keycloak_user_id,
                        "full_name": full_name,
                        "phone": phone,
                        "profile_json": profile,
                        "documents_json": remote_documents,
                        "status": "pending",
                        "created_at": created_at,
                    },
                )
                remote_application_created = True

            with get_database() as connection:
                connection.execute(
                    """
                    INSERT INTO account_applications
                    (id, role, email, keycloak_user_id, full_name, phone,
                     profile_json, documents_json, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        application_id,
                        role,
                        email,
                        keycloak_user_id,
                        full_name,
                        phone,
                        json.dumps(profile),
                        json.dumps(stored_documents),
                        created_at,
                    ),
                )
        except sqlite3.IntegrityError:
            for document in stored_documents:
                (directory / document["stored_name"]).unlink(missing_ok=True)
            if store and remote_application_created:
                try:
                    store.delete(
                        "account_applications", {"id": f"eq.{application_id}"}
                    )
                    if uploaded_document_paths:
                        store.delete_objects(
                            "application-documents", uploaded_document_paths
                        )
                except SupabaseStoreError:
                    current_app.logger.exception(
                        "Could not clean up a conflicting Supabase account application."
                    )
            if keycloak_user_id:
                try:
                    delete_pending_keycloak_account(keycloak_user_id)
                except KeycloakAdminError:
                    current_app.logger.exception(
                        "Could not clean up a pending Keycloak account after an application conflict."
                    )
            return jsonify(
                error="There is already a pending application for this email and account type."
            ), 409
        except SupabaseStoreError:
            for document in stored_documents:
                (directory / document["stored_name"]).unlink(missing_ok=True)
            if uploaded_document_paths:
                try:
                    store.delete_objects(
                        "application-documents", uploaded_document_paths
                    )
                except SupabaseStoreError:
                    current_app.logger.exception(
                        "Could not clean up an incomplete application document upload."
                    )
            if keycloak_user_id:
                try:
                    delete_pending_keycloak_account(keycloak_user_id)
                except KeycloakAdminError:
                    current_app.logger.exception(
                        "Could not clean up a pending Keycloak account after a Supabase failure."
                    )
            current_app.logger.exception("Supabase account application could not be saved.")
            return jsonify(
                error="Your application could not be saved to the application database. Please try again."
            ), 503
        except KeycloakAccountConflict as error:
            return jsonify(error=str(error)), 409
        except KeycloakAdminError as error:
            return jsonify(error=str(error)), 503
        except Exception:
            for document in stored_documents:
                (directory / document["stored_name"]).unlink(missing_ok=True)
            if store and remote_application_created:
                try:
                    store.delete(
                        "account_applications", {"id": f"eq.{application_id}"}
                    )
                    if uploaded_document_paths:
                        store.delete_objects(
                            "application-documents", uploaded_document_paths
                        )
                except SupabaseStoreError:
                    current_app.logger.exception(
                        "Could not clean up an application after a local database failure."
                    )
            if keycloak_user_id:
                try:
                    delete_pending_keycloak_account(keycloak_user_id)
                except KeycloakAdminError:
                    current_app.logger.exception(
                        "Could not clean up a pending Keycloak account after an application storage failure."
                    )
            raise

        return jsonify(
            application_id=application_id,
            status="pending",
            message=(
                "Your request is pending review. Your account will be enabled "
                "after an authorized reviewer approves it."
            ),
        ), 201

    @app.get("/admin/applications")
    def application_review_page():
        require_application_reviewer()
        response = send_from_directory(WEB_DIR, "applications.html")
        response.direct_passthrough = False
        if "csrf_token" not in session:
            session["csrf_token"] = secrets.token_urlsafe(32)
        html = response.get_data(as_text=True)
        html = html.replace(
            '<meta name="csrf-token" content="">',
            f'<meta name="csrf-token" content="{session["csrf_token"]}">',
            1,
        )
        response.set_data(html)
        response.headers["Cache-Control"] = "no-store"
        return response

    @app.get("/api/admin/applications")
    def list_account_applications():
        require_application_reviewer()
        status = request.args.get("status", "pending")
        if status not in {"pending", "approved", "rejected", "all"}:
            abort(400, "Unknown application status.")
        store = get_supabase_store()
        if store:
            query = {"select": "*", "order": "created_at.desc", "limit": 500}
            if status != "all":
                query["status"] = f"eq.{status}"
            try:
                rows = store.select("account_applications", **query)
            except SupabaseStoreError:
                current_app.logger.exception(
                    "Supabase account applications could not be loaded."
                )
                return jsonify(error="Account applications are temporarily unavailable."), 503
        else:
            with get_database() as connection:
                if status == "all":
                    rows = connection.execute(
                        "SELECT * FROM account_applications ORDER BY created_at DESC LIMIT 500"
                    ).fetchall()
                else:
                    rows = connection.execute(
                        """
                        SELECT * FROM account_applications
                        WHERE status = ? ORDER BY created_at DESC LIMIT 500
                        """,
                        (status,),
                    ).fetchall()
        result = []
        for row in rows:
            item = dict(row)
            profile = item.pop("profile_json")
            documents = item.pop("documents_json")
            item["profile"] = (
                json.loads(profile) if isinstance(profile, str) else profile
            )
            item["documents"] = (
                json.loads(documents) if isinstance(documents, str) else documents
            )
            item.pop("keycloak_user_id", None)
            for document in item["documents"]:
                document.pop("stored_name", None)
                document["url"] = (
                    f'/api/admin/applications/{item["id"]}/documents/{document["id"]}'
                )
            result.append(item)
        return jsonify(applications=result)

    @app.get("/api/admin/applications/<application_id>/documents/<document_id>")
    def get_application_document(application_id, document_id):
        require_application_reviewer()
        store = get_supabase_store()
        if store:
            try:
                rows = store.select(
                    "account_applications",
                    select="documents_json",
                    id=f"eq.{application_id}",
                    limit=1,
                )
            except SupabaseStoreError:
                current_app.logger.exception(
                    "Supabase application documents could not be read."
                )
                return jsonify(error="Application document is temporarily unavailable."), 503
            row = rows[0] if rows else None
            documents_json = row.get("documents_json") if row else None
        else:
            with get_database() as connection:
                row = connection.execute(
                    "SELECT documents_json FROM account_applications WHERE id = ?",
                    (application_id,),
                ).fetchone()
            documents_json = row["documents_json"] if row else None
        if documents_json is None:
            abort(404)
        documents = (
            json.loads(documents_json)
            if isinstance(documents_json, str)
            else documents_json
        )
        document = next(
            (item for item in documents if item["id"] == document_id),
            None,
        )
        if not document:
            abort(404)
        if store:
            try:
                content = store.download(
                    "application-documents", document["storage_path"]
                )
            except SupabaseStoreError:
                current_app.logger.exception(
                    "Supabase application document could not be downloaded."
                )
                return jsonify(error="Application document is temporarily unavailable."), 503
            response = current_app.response_class(
                content, mimetype=document["mime_type"]
            )
            if request.args.get("download") == "1":
                response.headers["Content-Disposition"] = (
                    f'attachment; filename="{secure_filename(document["filename"])}"'
                )
            response.headers["X-Content-Type-Options"] = "nosniff"
            response.headers["X-Frame-Options"] = "SAMEORIGIN"
            response.headers["Cache-Control"] = "private, no-store"
            return response
        suffix = Path(document["stored_name"]).suffix.lower()
        content_type = ALLOWED_DOCUMENT_TYPES[suffix][1]
        response = send_from_directory(
            application_document_directory(),
            document["stored_name"],
            as_attachment=request.args.get("download") == "1",
            download_name=document["filename"],
            mimetype=content_type,
        )
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "SAMEORIGIN"
        response.headers["Cache-Control"] = "private, no-store"
        return response

    @app.post("/api/admin/applications/<application_id>/decision")
    def decide_account_application(application_id):
        require_application_reviewer()
        if not request_is_same_origin() or not valid_csrf_token():
            abort(403, "This review request could not be verified.")
        payload = request.get_json(silent=True) or {}
        status = payload.get("status")
        note = str(payload.get("note", "")).strip()
        if status not in {"approved", "rejected"} or len(note) > 1000:
            return jsonify(error="Choose approve or reject and use a short review note."), 400
        identity = session["identity"]
        store = get_supabase_store()
        if store:
            try:
                applications = store.select(
                    "account_applications",
                    select="*",
                    id=f"eq.{application_id}",
                    status="eq.pending",
                    limit=1,
                )
                application = applications[0] if applications else None
            except SupabaseStoreError:
                current_app.logger.exception(
                    "Supabase account application could not be loaded for review."
                )
                return jsonify(error="Account application is temporarily unavailable."), 503
        else:
            with get_database() as connection:
                application = connection.execute(
                    "SELECT * FROM account_applications WHERE id = ? AND status = 'pending'",
                    (application_id,),
                ).fetchone()
        if not application:
            return jsonify(error="Pending application was not found."), 404
        keycloak_user_id = application["keycloak_user_id"]
        if not keycloak_user_id:
            return jsonify(
                error="This application predates account provisioning and requires administrator review."
            ), 409

        application_profile = application["profile_json"]
        if isinstance(application_profile, str):
            application_profile = json.loads(application_profile)
        try:
            if status == "approved":
                profile_json = application["profile_json"]
                approve_pending_keycloak_account(
                    keycloak_user_id,
                    application["role"],
                    application_profile,
                )
                if store:
                    sync_approved_profile_to_supabase(
                        store, application, application_profile
                    )
            else:
                delete_pending_keycloak_account(keycloak_user_id)
        except KeycloakAdminError as error:
            return jsonify(error=str(error)), 503
        except SupabaseStoreError:
            if status == "approved":
                try:
                    disable_pending_keycloak_account(keycloak_user_id)
                except KeycloakAdminError:
                    current_app.logger.exception(
                        "Could not disable an approved Keycloak user after a Supabase profile failure."
                    )
            current_app.logger.exception(
                "Approved account profile could not be saved to Supabase."
            )
            return jsonify(
                error="The account profile could not be saved. The applicant remains unable to sign in until this is resolved."
            ), 503

        try:
            reviewed_at = datetime.now(timezone.utc).isoformat()
            if store:
                store.update(
                    "account_applications",
                    {"id": f"eq.{application_id}", "status": "eq.pending"},
                    {
                        "status": status,
                        "reviewed_at": reviewed_at,
                        "reviewed_by_identity": identity.get("email")
                        or identity["subject"],
                        "review_note": note,
                    },
                )
            with get_database() as connection:
                cursor = connection.execute(
                    """
                    UPDATE account_applications
                    SET status = ?, reviewed_at = ?, reviewed_by = ?, review_note = ?
                    WHERE id = ? AND status = 'pending'
                    """,
                    (
                        status,
                        reviewed_at,
                        identity.get("email") or identity["subject"],
                        note,
                        application_id,
                    ),
                )
            if cursor.rowcount != 1:
                raise RuntimeError("The application decision could not be saved.")
        except Exception:
            if status == "approved":
                try:
                    disable_pending_keycloak_account(keycloak_user_id)
                except KeycloakAdminError:
                    current_app.logger.exception(
                        "Could not disable a provisioned Keycloak user after a review database failure."
                    )
            raise
        return jsonify(
            status=status,
            message=(
                "Approved. The account is now active; the applicant can sign in "
                "with the email address and password they registered."
                if status == "approved"
                else "Application rejected and the pending sign-in account was removed."
            ),
        )

    @app.get("/projects")
    def project_workspace():
        if not session.get("identity"):
            return redirect("/")
        identity = require_project_identity()
        response = send_from_directory(WEB_DIR, "projects.html")
        response.direct_passthrough = False
        if "csrf_token" not in session:
            session["csrf_token"] = secrets.token_urlsafe(32)
        html = response.get_data(as_text=True)
        html = html.replace(
            '<meta name="csrf-token" content="">',
            f'<meta name="csrf-token" content="{session["csrf_token"]}">',
            1,
        )
        safe_identity = json.dumps(identity, ensure_ascii=True).replace("<", "\\u003c")
        html = html.replace(
            '<script src="assets/js/auth.js"></script>',
            f'<script>window.SahayogSession={safe_identity};</script>'
            '<script src="assets/js/auth.js"></script>',
            1,
        )
        response.set_data(html)
        response.headers["Cache-Control"] = "no-store"
        return response

    @app.get("/public/projects")
    def public_projects_page():
        response = send_from_directory(WEB_DIR, "public-projects.html")
        response.headers["Cache-Control"] = "public, max-age=60"
        return response

    @app.get("/api/public/projects")
    def list_public_projects():
        store = get_supabase_store()
        if store:
            try:
                project_rows = store.select(
                    "work_projects",
                    select=(
                        "id,title,sanctioned_amount,start_date,end_date,mp_name,"
                        "constituency,state,district,status,completion_percent"
                    ),
                    order="created_at.desc",
                    limit=1000,
                )
                project_ids = [row["id"] for row in project_rows]
                reports = (
                    store.select(
                        "work_reports",
                        select="project_id,report_date,completion_percent,review_status",
                        project_id=f"in.({','.join(project_ids)})",
                        order="report_date.desc",
                        limit=5000,
                    )
                    if project_ids
                    else []
                )
            except SupabaseStoreError:
                current_app.logger.exception(
                    "Public project summaries could not be loaded from Supabase."
                )
                return jsonify(error="Public project information is temporarily unavailable."), 503
        else:
            with get_database() as connection:
                project_rows = connection.execute(
                    "SELECT * FROM work_projects ORDER BY created_at DESC LIMIT 1000"
                ).fetchall()
                reports = connection.execute(
                    """
                    SELECT project_id, report_date, completion_percent, review_status
                    FROM work_reports ORDER BY report_date DESC LIMIT 5000
                    """
                ).fetchall()

        latest_by_project = {}
        for report in reports:
            if report["review_status"] == "approved":
                latest_by_project.setdefault(report["project_id"], report)
        summaries = []
        for project in project_rows:
            latest = latest_by_project.get(project["id"])
            report_status = latest["review_status"] if latest else None
            verified_progress = (
                latest["completion_percent"]
                if latest and report_status == "approved"
                else None
            )
            summaries.append(
                {
                    "title": project["title"],
                    "mp_name": project["mp_name"],
                    "constituency": project["constituency"],
                    "state": project["state"],
                    "district": project["district"],
                    "sanctioned_amount": project["sanctioned_amount"],
                    "start_date": project["start_date"],
                    "end_date": project["end_date"],
                    "status": project.get("status", "sanctioned")
                    if isinstance(project, dict)
                    else "sanctioned",
                    "verified_completion_percent": verified_progress,
                    "last_update_date": latest["report_date"] if latest else None,
                }
            )
        response = jsonify(projects=summaries)
        response.headers["Cache-Control"] = "public, max-age=60"
        return response

    @app.get("/past-works")
    def past_works_page():
        if not session.get("identity"):
            return redirect("/")
        identity = require_authority_history_identity()
        response = send_from_directory(WEB_DIR, "past-works.html")
        response.direct_passthrough = False
        safe_identity = json.dumps(identity, ensure_ascii=True).replace("<", "\\u003c")
        html = response.get_data(as_text=True).replace(
            '<script src="assets/js/auth.js"></script>',
            f'<script>window.SahayogSession={safe_identity};</script>'
            '<script src="assets/js/auth.js"></script>',
            1,
        )
        response.set_data(html)
        response.headers["Cache-Control"] = "no-store"
        return response

    @app.get("/api/past-works")
    def list_past_works():
        identity = require_authority_history_identity()
        profile = identity.get("profile") or {}
        scope_fields = {
            "mp": ("state", "constituency"),
            "state_authority": ("state",),
            "district_authority": ("state", "district"),
        }.get(identity["role"], ())
        if any(not str(profile.get(field) or "").strip() for field in scope_fields):
            abort(
                403,
                description="Your account is missing a verified geographic assignment.",
            )
        record_type = request.args.get("type", "all").casefold()
        if record_type not in {"all", "completed", "recommended"}:
            abort(400, description="Choose completed, recommended, or all work.")
        try:
            page = int(request.args.get("page", "1"))
        except ValueError:
            abort(400, description="Page must be a positive integer.")
        if page < 1 or page > 100000:
            abort(400, description="Page must be between 1 and 100000.")

        selected_state = normalized_scope_value(request.args.get("state"))
        search = normalized_scope_value(request.args.get("search"))
        page_size = 25
        start = (page - 1) * page_size
        works = []
        states = set()
        total = 0
        for work in read_historical_works(
            current_app.config["HISTORICAL_WORKS_DIRECTORY"], record_type
        ):
            if not historical_work_in_scope(work, identity):
                continue
            if work["state"].strip():
                states.add(work["state"].strip())
            if selected_state and normalized_scope_value(work["state"]) != selected_state:
                continue
            if search and search not in normalized_scope_value(
                " ".join(work.values())
            ):
                continue
            if start <= total < start + page_size:
                works.append(work)
            total += 1

        response = jsonify(
            works=works,
            states=sorted(states, key=str.casefold),
            total=total,
            page=page,
            page_size=page_size,
            total_pages=max(1, math.ceil(total / page_size)),
        )
        response.headers["Cache-Control"] = "private, no-store"
        return response

    @app.get("/api/projects")
    def list_projects():
        identity = require_project_identity()
        store = get_supabase_store()
        if store:
            try:
                rows = store.select(
                    "work_projects", select="*", order="start_date.desc", limit=1000
                )
                visible_rows = [
                    row for row in rows if project_visible_to_identity(row, identity)
                ]
                project_ids = [row["id"] for row in visible_rows]
                reports_by_project = {}
                messages_by_project = {}
                if project_ids:
                    project_filter = f"in.({','.join(project_ids)})"
                    reports = store.select(
                        "work_reports",
                        select="*",
                        project_id=project_filter,
                        order="report_date.desc",
                        limit=5000,
                    )
                    messages = store.select(
                        "project_messages",
                        select="*",
                        project_id=project_filter,
                        order="created_at.asc",
                        limit=5000,
                    )
                    for report in reports:
                        reports_by_project.setdefault(
                            report["project_id"], []
                        ).append(report)
                    for message in messages:
                        messages_by_project.setdefault(
                            message["project_id"], []
                        ).append(message)
                projects = [
                    supabase_project_response(
                        row,
                        reports_by_project.get(row["id"], []),
                        messages_by_project.get(row["id"], []),
                    )
                    for row in visible_rows
                ]
            except SupabaseStoreError:
                current_app.logger.exception("Supabase project data could not be loaded.")
                return jsonify(error="Project data is temporarily unavailable."), 503
            response = jsonify(projects=projects)
            response.headers["Cache-Control"] = "private, no-store"
            return response

        with get_database() as connection:
            rows = connection.execute(
                "SELECT * FROM work_projects ORDER BY start_date DESC, title"
            ).fetchall()
            projects = [
                project_report_response(row, connection)
                for row in rows
                if project_visible_to_identity(row, identity)
            ]
        response = jsonify(projects=projects)
        response.headers["Cache-Control"] = "private, no-store"
        return response

    @app.post("/api/projects")
    def create_project():
        identity = require_project_identity()
        if identity["role"] not in PROJECT_AUTHORITY_ROLES:
            abort(403)
        if not request_is_same_origin() or not valid_csrf_token():
            abort(403, "This project assignment could not be verified.")

        payload = request.get_json(silent=True) or {}
        fields = {
            key: str(payload.get(key, "")).strip()
            for key in (
                "title",
                "description",
                "start_date",
                "end_date",
                "mp_name",
                "constituency",
                "state",
                "district",
                "location",
                "contractor_email",
                "contractor_name",
            )
        }
        if any(
            not fields[key]
            for key in (
                "title",
                "start_date",
                "end_date",
                "mp_name",
                "constituency",
                "state",
                "district",
                "location",
                "contractor_email",
            )
        ):
            return jsonify(error="Complete all required project and contractor fields."), 400
        if any(
            len(fields[key]) > limit
            for key, limit in {
                "title": 180,
                "description": 2000,
                "mp_name": 160,
                "constituency": 160,
                "state": 100,
                "district": 100,
                "location": 300,
                "contractor_email": 254,
                "contractor_name": 160,
            }.items()
        ):
            return jsonify(error="A project field exceeds its permitted length."), 400
        contractor_email = fields["contractor_email"].casefold()
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", contractor_email):
            return jsonify(error="Enter a valid contractor account email."), 400
        start_date = parse_iso_date(fields["start_date"])
        end_date = parse_iso_date(fields["end_date"])
        if not start_date or not end_date or end_date < start_date:
            return jsonify(error="Enter a valid project start and end date."), 400
        try:
            sanctioned_amount = float(payload.get("sanctioned_amount"))
        except (TypeError, ValueError):
            sanctioned_amount = math.nan
        if not math.isfinite(sanctioned_amount) or sanctioned_amount <= 0:
            return jsonify(error="Sanctioned amount must be a positive number."), 400
        if sanctioned_amount > 1_000_000_000_000:
            return jsonify(error="Sanctioned amount exceeds the permitted maximum."), 400

        if identity["role"] == "district_authority":
            profile = identity.get("profile", {})
            if (
                fields["state"].casefold()
                != (profile.get("state") or "").casefold()
                or fields["district"].casefold()
                != (profile.get("district") or "").casefold()
                or not profile.get("state")
                or not profile.get("district")
            ):
                abort(403, "Projects must be assigned within your verified district.")
        if identity["role"] == "state_authority":
            profile = identity.get("profile", {})
            if (
                not profile.get("state")
                or fields["state"].casefold()
                != (profile.get("state") or "").casefold()
            ):
                abort(403, "Projects must be assigned within your verified state.")
        if identity["role"] == "mp":
            profile = identity.get("profile", {})
            if (
                not profile.get("state")
                or not profile.get("constituency")
                or fields["state"].casefold()
                != (profile.get("state") or "").casefold()
                or fields["constituency"].casefold()
                != (profile.get("constituency") or "").casefold()
            ):
                abort(403, "Projects must be assigned within your verified constituency.")

        project_id = str(uuid.uuid4())
        created_at = datetime.now(timezone.utc).isoformat()
        store = get_supabase_store()
        if store:
            try:
                store.insert(
                    "work_projects",
                    {
                        "id": project_id,
                        "title": fields["title"],
                        "description": fields["description"],
                        "sanctioned_amount": sanctioned_amount,
                        "start_date": start_date.isoformat(),
                        "end_date": end_date.isoformat(),
                        "mp_name": fields["mp_name"],
                        "constituency": fields["constituency"],
                        "state": fields["state"],
                        "district": fields["district"],
                        "location": fields["location"],
                        "contractor_email": contractor_email,
                        "contractor_name": fields["contractor_name"],
                        "created_by_sub": identity["subject"],
                        "created_by_email": identity.get("email", "").casefold(),
                        "created_at": created_at,
                    },
                )
            except SupabaseStoreError:
                current_app.logger.exception("Supabase project data could not be saved.")
                return jsonify(error="Project could not be saved to the application database."), 503
        with get_database() as connection:
            connection.execute(
                """
                INSERT INTO work_projects
                (id, title, description, sanctioned_amount, start_date, end_date,
                 mp_name, constituency, state, district, location,
                 contractor_email, contractor_name, created_by_sub,
                 created_by_email, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    project_id,
                    fields["title"],
                    fields["description"],
                    sanctioned_amount,
                    start_date.isoformat(),
                    end_date.isoformat(),
                    fields["mp_name"],
                    fields["constituency"],
                    fields["state"],
                    fields["district"],
                    fields["location"],
                    contractor_email,
                    fields["contractor_name"],
                    identity["subject"],
                    identity.get("email", "").casefold(),
                    created_at,
                ),
            )
        return jsonify(project_id=project_id, message="Project assigned."), 201

    @app.post("/api/projects/<project_id>/reports")
    def create_project_report(project_id):
        identity = require_project_identity()
        if identity["role"] != "contractor":
            abort(403)
        if not request_is_same_origin() or not valid_csrf_token():
            abort(403, "This progress report could not be verified.")

        store = get_supabase_store()
        if store:
            try:
                projects = store.select(
                    "work_projects",
                    select="*",
                    id=f"eq.{project_id}",
                    limit=1,
                )
                project = projects[0] if projects else None
                existing_reports = store.select(
                    "work_reports",
                    select="report_date,completion_percent",
                    project_id=f"eq.{project_id}",
                    order="report_date.desc",
                    limit=1,
                )
                previous = existing_reports[0] if existing_reports else None
            except SupabaseStoreError:
                current_app.logger.exception("Supabase project data could not be read.")
                return jsonify(error="Project data is temporarily unavailable."), 503
        else:
            with get_database() as connection:
                project = connection.execute(
                    "SELECT * FROM work_projects WHERE id = ?", (project_id,)
                ).fetchone()
                previous = connection.execute(
                    """
                    SELECT report_date, completion_percent FROM work_reports
                    WHERE project_id = ? ORDER BY report_date DESC LIMIT 1
                    """,
                    (project_id,),
                ).fetchone()

        if not project or not project_visible_to_identity(project, identity):
            abort(404)

        with get_database() as connection:
            if not project or not project_visible_to_identity(project, identity):
                abort(404)

            report_date_text = request.form.get("report_date", "").strip()
            report_date = parse_iso_date(report_date_text)
            if (
                not report_date
                or report_date.isoformat() < project["start_date"]
                or report_date.isoformat() > project["end_date"]
                or report_date > date.today()
            ):
                return jsonify(
                    error="Choose a report date within the project schedule and not in the future."
                ), 400

            try:
                completion_percent = float(request.form.get("completion_percent", ""))
                hours_worked = float(request.form.get("hours_worked", ""))
                latitude = float(request.form.get("latitude", ""))
                longitude = float(request.form.get("longitude", ""))
            except (TypeError, ValueError):
                return jsonify(error="Enter valid progress, hours, and captured site coordinates."), 400
            if (
                not math.isfinite(completion_percent)
                or not 0 <= completion_percent <= 100
                or not math.isfinite(hours_worked)
                or not 0 <= hours_worked <= 24
                or not math.isfinite(latitude)
                or not -90 <= latitude <= 90
                or not math.isfinite(longitude)
                or not -180 <= longitude <= 180
            ):
                return jsonify(error="Progress, time, or site coordinates are outside valid limits."), 400

            materials = request.form.get("materials", "").strip()
            notes = request.form.get("notes", "").strip()
            if not materials or len(materials) > 4000 or len(notes) > 2000:
                return jsonify(
                    error="List materials (up to 4,000 characters) and keep notes within 2,000 characters."
                ), 400

            if previous and report_date.isoformat() <= previous["report_date"]:
                return jsonify(error="Submit one report per day, in date order."), 409
            if previous and completion_percent < previous["completion_percent"]:
                return jsonify(error="Cumulative completion cannot be lower than the previous report."), 400

        photos = [photo for photo in request.files.getlist("photos") if photo.filename]
        if not photos or len(photos) > 4:
            return jsonify(error="Upload between one and four site photos."), 400
        prepared_photos = []
        for photo in photos:
            filename = secure_filename(photo.filename)
            suffix = Path(filename).suffix.lower()
            signature, mime_type = {
                ".jpg": (b"\xff\xd8\xff", "image/jpeg"),
                ".jpeg": (b"\xff\xd8\xff", "image/jpeg"),
                ".png": (b"\x89PNG\r\n\x1a\n", "image/png"),
            }.get(suffix, (None, None))
            if not filename or not signature:
                return jsonify(error="Site photos must be JPEG or PNG images."), 400
            content = photo.stream.read(MAX_DOCUMENT_BYTES + 1)
            if len(content) > MAX_DOCUMENT_BYTES:
                return jsonify(error="Each site photo must be 5 MB or smaller."), 400
            if not content.startswith(signature):
                return jsonify(error=f"{filename} is not a valid {suffix} image."), 400
            photo_id = uuid.uuid4().hex
            prepared_photos.append(
                {
                    "id": photo_id,
                    "stored_name": f"{photo_id}{suffix}",
                    "filename": filename[:200],
                    "mime_type": mime_type,
                    "content": content,
                }
            )

        photo_directory = Path(app.config["WORK_REPORT_PHOTO_DIRECTORY"])
        photo_directory.mkdir(parents=True, exist_ok=True)
        stored_photos = [
            {key: value for key, value in photo.items() if key != "content"}
            for photo in prepared_photos
        ]
        report_id = str(uuid.uuid4())
        created_at = datetime.now(timezone.utc).isoformat()
        if store:
            uploaded_paths = []
            remote_photos = []
            try:
                for photo in prepared_photos:
                    storage_path = (
                        f"{project_id}/{report_id}/{photo['stored_name']}"
                    )
                    store.upload(
                        "work-report-photos",
                        storage_path,
                        photo["content"],
                        photo["mime_type"],
                    )
                    uploaded_paths.append(storage_path)
                    remote_photos.append(
                        {
                            "id": photo["id"],
                            "filename": photo["filename"],
                            "mime_type": photo["mime_type"],
                            "storage_path": storage_path,
                        }
                    )
                store.insert(
                    "work_reports",
                    {
                        "id": report_id,
                        "project_id": project_id,
                        "report_date": report_date.isoformat(),
                        "completion_percent": completion_percent,
                        "hours_worked": hours_worked,
                        "materials": materials,
                        "notes": notes,
                        "latitude": latitude,
                        "longitude": longitude,
                        "submitted_by_email": identity["email"].casefold(),
                        "photos_json": remote_photos,
                        "created_at": created_at,
                    },
                )
            except SupabaseStoreError as error:
                if uploaded_paths:
                    try:
                        store.delete_objects("work-report-photos", uploaded_paths)
                    except SupabaseStoreError:
                        current_app.logger.exception(
                            "Could not clean up an incomplete report photo upload."
                        )
                if error.status_code == 409:
                    return jsonify(
                        error="A report for this project and date already exists."
                    ), 409
                current_app.logger.exception("Supabase progress report could not be saved.")
                return jsonify(
                    error="Progress report could not be saved to the application database."
                ), 503
            return jsonify(report_id=report_id, status="submitted"), 201

        for photo in prepared_photos:
            (photo_directory / photo["stored_name"]).write_bytes(photo["content"])

        try:
            with get_database() as connection:
                connection.execute(
                    """
                    INSERT INTO work_reports
                    (id, project_id, report_date, completion_percent, hours_worked,
                     materials, notes, latitude, longitude, submitted_by_email,
                     photos_json, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        report_id,
                        project_id,
                        report_date.isoformat(),
                        completion_percent,
                        hours_worked,
                        materials,
                        notes,
                        latitude,
                        longitude,
                        identity["email"].casefold(),
                        json.dumps(stored_photos),
                        created_at,
                    ),
                )
        except sqlite3.IntegrityError:
            for photo in stored_photos:
                (photo_directory / photo["stored_name"]).unlink(missing_ok=True)
            return jsonify(error="A report for this project and date already exists."), 409
        except Exception:
            for photo in stored_photos:
                (photo_directory / photo["stored_name"]).unlink(missing_ok=True)
            raise
        return jsonify(report_id=report_id, status="submitted"), 201

    @app.post("/api/projects/<project_id>/reports/<report_id>/review")
    def review_project_report(project_id, report_id):
        identity = require_project_identity()
        if identity["role"] not in PROJECT_AUTHORITY_ROLES:
            abort(403)
        if not request_is_same_origin() or not valid_csrf_token():
            abort(403, "This progress review could not be verified.")
        payload = request.get_json(silent=True) or {}
        review_status = payload.get("status")
        note = str(payload.get("note", "")).strip()
        if review_status not in {
            "approved",
            "rejected",
            "clarification_requested",
        }:
            return jsonify(error="Choose accept, reject, or request clarification."), 400
        if len(note) > 1000 or (
            review_status in {"rejected", "clarification_requested"} and not note
        ):
            return jsonify(
                error="Add a short reason when rejecting or requesting clarification."
            ), 400

        store = get_supabase_store()
        if store:
            try:
                projects = store.select(
                    "work_projects",
                    select="*",
                    id=f"eq.{project_id}",
                    limit=1,
                )
                reports = store.select(
                    "work_reports",
                    select="id,review_status",
                    id=f"eq.{report_id}",
                    project_id=f"eq.{project_id}",
                    limit=1,
                )
                if (
                    not projects
                    or not project_visible_to_identity(projects[0], identity)
                    or not reports
                ):
                    abort(404)
                if reports[0]["review_status"] in {"approved", "rejected"}:
                    return jsonify(
                        error="This report already has a final decision."
                    ), 409
                store.update(
                    "work_reports",
                    {"id": f"eq.{report_id}", "project_id": f"eq.{project_id}"},
                    {
                        "review_status": review_status,
                        "reviewed_by_sub": identity["subject"],
                        "reviewed_at": datetime.now(timezone.utc).isoformat(),
                        "review_note": note,
                    },
                )
            except SupabaseStoreError:
                current_app.logger.exception(
                    "Supabase progress report review could not be saved."
                )
                return jsonify(error="The progress review could not be saved."), 503
        else:
            with get_database() as connection:
                project = connection.execute(
                    "SELECT * FROM work_projects WHERE id = ?", (project_id,)
                ).fetchone()
                report = connection.execute(
                    "SELECT id, review_status FROM work_reports WHERE id = ? AND project_id = ?",
                    (report_id, project_id),
                ).fetchone()
                if (
                    not project
                    or not project_visible_to_identity(project, identity)
                    or not report
                ):
                    abort(404)
                if report["review_status"] in {"approved", "rejected"}:
                    return jsonify(
                        error="This report already has a final decision."
                    ), 409
                connection.execute(
                    """
                    UPDATE work_reports
                    SET review_status = ?, reviewed_by_sub = ?, reviewed_at = ?,
                        review_note = ?
                    WHERE id = ? AND project_id = ?
                    """,
                    (
                        review_status,
                        identity["subject"],
                        datetime.now(timezone.utc).isoformat(),
                        note,
                        report_id,
                        project_id,
                    ),
                )
        return jsonify(status=review_status, message="Progress review saved.")

    @app.post("/api/projects/<project_id>/messages")
    def create_project_message(project_id):
        identity = require_project_identity()
        if not request_is_same_origin() or not valid_csrf_token():
            abort(403, "This project message could not be verified.")
        payload = request.get_json(silent=True) or {}
        message_type = str(payload.get("message_type", "message"))
        message = str(payload.get("message", "")).strip()
        allowed_types = (
            {"message", "clarification_response"}
            if identity["role"] == "contractor"
            else {"message", "review", "clarification_request"}
        )
        if message_type not in allowed_types:
            return jsonify(error="This message type is not available for your account."), 400
        if not message or len(message) > 2000:
            return jsonify(error="Enter a message of up to 2,000 characters."), 400
        store = get_supabase_store()
        message_id = str(uuid.uuid4())
        created_at = datetime.now(timezone.utc).isoformat()
        record = {
            "id": message_id,
            "project_id": project_id,
            "sender_sub": identity["subject"],
            "sender_email": identity.get("email", "").casefold(),
            "sender_name": identity.get("name") or identity.get("shortName") or "Project participant",
            "sender_role": identity["role"],
            "message_type": message_type,
            "message": message,
            "created_at": created_at,
        }
        if store:
            try:
                projects = store.select(
                    "work_projects",
                    select="*",
                    id=f"eq.{project_id}",
                    limit=1,
                )
                if not projects or not project_visible_to_identity(projects[0], identity):
                    abort(404)
                store.insert("project_messages", record)
            except SupabaseStoreError:
                current_app.logger.exception(
                    "Supabase project message could not be saved."
                )
                return jsonify(error="The project message could not be saved."), 503
        else:
            with get_database() as connection:
                project = connection.execute(
                    "SELECT * FROM work_projects WHERE id = ?", (project_id,)
                ).fetchone()
                if not project or not project_visible_to_identity(project, identity):
                    abort(404)
                connection.execute(
                    """
                    INSERT INTO project_messages
                    (id, project_id, sender_sub, sender_email, sender_name,
                     sender_role, message_type, message, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        message_id,
                        project_id,
                        record["sender_sub"],
                        record["sender_email"],
                        record["sender_name"],
                        record["sender_role"],
                        record["message_type"],
                        record["message"],
                        created_at,
                    ),
                )
        return jsonify(message_id=message_id, status="sent"), 201

    @app.get("/api/projects/<project_id>/reports/<report_id>/photos/<photo_id>")
    def get_project_report_photo(project_id, report_id, photo_id):
        identity = require_project_identity()
        store = get_supabase_store()
        if store:
            try:
                projects = store.select(
                    "work_projects", select="*", id=f"eq.{project_id}", limit=1
                )
                reports = store.select(
                    "work_reports",
                    select="photos_json",
                    id=f"eq.{report_id}",
                    project_id=f"eq.{project_id}",
                    limit=1,
                )
            except SupabaseStoreError:
                current_app.logger.exception("Supabase report photo could not be read.")
                return jsonify(error="Report photo is temporarily unavailable."), 503
            if (
                not projects
                or not project_visible_to_identity(projects[0], identity)
                or not reports
            ):
                abort(404)
            stored_photos = reports[0].get("photos_json") or []
            if isinstance(stored_photos, str):
                stored_photos = json.loads(stored_photos)
            photo = next(
                (item for item in stored_photos if item["id"] == photo_id),
                None,
            )
            if not photo:
                abort(404)
            try:
                content = store.download(
                    "work-report-photos", photo["storage_path"]
                )
            except SupabaseStoreError:
                current_app.logger.exception("Supabase report photo could not be downloaded.")
                return jsonify(error="Report photo is temporarily unavailable."), 503
            response = current_app.response_class(
                content, mimetype=photo["mime_type"]
            )
            response.headers["X-Content-Type-Options"] = "nosniff"
            response.headers["Cache-Control"] = "private, no-store"
            return response

        with get_database() as connection:
            project = connection.execute(
                "SELECT * FROM work_projects WHERE id = ?", (project_id,)
            ).fetchone()
            report = connection.execute(
                "SELECT photos_json FROM work_reports WHERE id = ? AND project_id = ?",
                (report_id, project_id),
            ).fetchone()
        if (
            not project
            or not project_visible_to_identity(project, identity)
            or not report
        ):
            abort(404)
        photo = next(
            (
                item
                for item in json.loads(report["photos_json"])
                if item["id"] == photo_id
            ),
            None,
        )
        if not photo:
            abort(404)
        response = send_from_directory(
            app.config["WORK_REPORT_PHOTO_DIRECTORY"],
            photo["stored_name"],
            mimetype=photo["mime_type"],
        )
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Cache-Control"] = "private, no-store"
        return response

    @app.get("/dashboard.html")
    def dashboard():
        identity = session.get("identity")
        if (
            not identity
            or identity.get("role") not in ROLES
            or identity.get("role") == "application_reviewer"
        ):
            return redirect("/")
        if identity["role"] == "contractor":
            return redirect("/projects")

        html = (WEB_DIR / "dashboard.html").read_text(encoding="utf-8")
        safe_identity = json.dumps(identity, ensure_ascii=True).replace("<", "\\u003c")
        injection = f"<script>window.SahayogSession={safe_identity};</script>"
        html = html.replace(
            '<script src="assets/js/auth.js"></script>',
            f'{injection}<script src="assets/js/auth.js"></script>',
            1,
        )
        response = current_app.response_class(html, mimetype="text/html")
        response.headers["Cache-Control"] = "no-store"
        return response

    @app.get("/auth/login")
    def login():
        requested_role = request.args.get("role", "citizen")
        if requested_role not in ROLES and requested_role != "authority":
            abort(400, "Unknown Sahayog access level.")
        if session.get("identity"):
            return identity_destination(session["identity"])

        session["requested_role"] = requested_role
        redirect_uri = f'{app.config["PUBLIC_BASE_URL"]}/auth/callback'
        return oauth.keycloak.authorize_redirect(
            redirect_uri,
            code_verifier=generate_token(48)
        )
    @app.post('/auth/demo-login')
    def demo_login():
        """Demo login for contractor with static credentials.
        Accepts JSON payload with 'email' and 'password'.
        On success, sets session identity and creates sample projects.
        """
        data = request.get_json(silent=True) or {}
        email = data.get('email')
        password = data.get('password')
        DEMO_EMAIL = 'vvce24cse0507@vvce.ac.in'
        DEMO_PASSWORD = 'Vinay21@2006'
        if email != DEMO_EMAIL or password != DEMO_PASSWORD:
            abort(401, 'Invalid demo credentials')
        # Set session identity for contractor
        session['identity'] = {
            'role': 'contractor',
            'email': email,
            'sub': 'demo-contractor-sub',
            'profile': {},
        }
        # Insert sample projects for this contractor if not existing
        with get_database() as conn:
            existing = conn.execute(
                "SELECT COUNT(*) FROM work_projects WHERE contractor_email = ?",
                (email,)
            ).fetchone()[0]
            if existing == 0:
                for i in range(1, 3):
                    conn.execute(
                        """
                        INSERT INTO work_projects (
                            id, title, description, sanctioned_amount,
                            start_date, end_date, mp_name, constituency,
                            state, district, location, contractor_email,
                            contractor_name, created_by_sub, created_by_email, created_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            f'demo-proj-{i}',
                            f'Demo Project {i}',
                            f'Description for demo project {i}',
                            100000 * i,
                            '2026-01-01',
                            '2026-12-31',
                            'Demo MP',
                            'Demo Constituency',
                            'Demo State',
                            'Demo District',
                            f'Demo Location {i}',
                            email,
                            f'Demo Contractor {i}',
                            'demo-contractor-sub',
                            email,
                            datetime.utcnow().isoformat()
                        )
                    )
                conn.commit()
        return redirect('/projects')


    @app.get("/auth/callback")
    def callback():
        try:
            token = oauth.keycloak.authorize_access_token()
        except OAuthError:
            current_app.logger.warning("Keycloak rejected the OAuth callback.")
            session.pop("requested_role", None)
            return redirect("/?auth_error=provider")

        userinfo = token.get("userinfo")
        if not userinfo or not userinfo.get("sub"):
            abort(401, "The identity provider did not return a verified user identity.")
        if not userinfo.get("email") or userinfo.get("email_verified") is not True:
            current_app.logger.info(
                "Keycloak sign-in rejected because the account lacks a verified email."
            )
            session.pop("requested_role", None)
            return redirect("/?auth_error=email")

        role_claims = set(userinfo.get("realm_access", {}).get("roles", []))
        client_roles = (
            userinfo.get("resource_access", {})
            .get(app.config["KEYCLOAK_CLIENT_ID"], {})
            .get("roles", [])
        )
        role_claims.update(client_roles)

        requested_role = session.pop("requested_role", "citizen")
        assigned_authority_roles = role_claims.intersection(PROJECT_AUTHORITY_ROLES)
        if requested_role == "authority" or (
            requested_role == "application_reviewer" and assigned_authority_roles
        ):
            if not assigned_authority_roles:
                current_app.logger.info(
                    "Authenticated user has no assigned Sahayog authority role."
                )
                return redirect("/?auth_error=role")
            priority = (
                "mp",
                "district_authority",
                "state_authority",
                "nodal_officer",
                "ministry",
            )
            role_key = next(
                role for role in priority if role in assigned_authority_roles
            )
        elif requested_role != "citizen" and requested_role not in role_claims:
            current_app.logger.info(
                "Authenticated user lacks requested Sahayog role %s.",
                requested_role,
            )
            return redirect("/?auth_error=role")
        else:
            role_key = requested_role
        role = ROLES[role_key]
        display_name = (
            userinfo.get("name")
            or userinfo.get("preferred_username")
            or userinfo.get("email")
            or "Sahayog user"
        )
        identity = {
            "subject": userinfo["sub"],
            "name": display_name,
            "shortName": display_name,
            "email": userinfo.get("email", ""),
            "role": role_key,
            "roleLabel": role["label"],
            "access": role["access"],
            "contractorId": userinfo.get("contractor_id"),
            "roles": sorted(role_claims),
            "profile": {
                "constituency": userinfo.get("constituency", ""),
                "state": userinfo.get("state", ""),
                "house": userinfo.get("house", ""),
                "locations": userinfo.get("locations", []),
                "district": userinfo.get("district", ""),
                "department": userinfo.get("department", ""),
                "designation": userinfo.get("designation", ""),
                "office_address": userinfo.get("office_address", ""),
                "company_name": userinfo.get("company_name", ""),
                "business_registration": userinfo.get(
                    "business_registration", ""
                ),
            },
        }
        session.clear()
        session.permanent = True
        session["identity"] = identity
        return identity_destination(identity)

    @app.post("/auth/logout")
    def logout():
        origin = request.headers.get("Origin")
        referer = request.headers.get("Referer")
        source = origin or referer
        if not request_is_same_origin():
            abort(403, "Sign-out request must come from this Sahayog origin.")
        session.clear()
        return redirect("/")

    return app


app = create_app()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    app.run(
        host=os.environ.get("SAHAYOG_HOST", "127.0.0.1"),
        port=int(os.environ.get("SAHAYOG_PORT", "5000")),
        debug=False,
    )
