import csv
import os
import re
import sqlite3
from datetime import date, timedelta
from io import BytesIO
from urllib.parse import parse_qs, urlparse
from requests.exceptions import ConnectionError

os.environ.setdefault("SAHAYOG_SECRET_KEY", "test-only-secret")

import web_app
from web_app import create_app


def create_test_app(tmp_path):
    return create_app(
        {
            "TESTING": True,
            "SECRET_KEY": "test-session-secret",
            "PUBLIC_BASE_URL": "http://localhost:5000",
            "KEYCLOAK_ISSUER": "https://idp.example/realms/sahayog",
            "SUPABASE_URL": "",
            "SUPABASE_SECRET_KEY": "",
            "APPLICATION_DATABASE": str(tmp_path / "applications.sqlite3"),
            "APPLICATION_DOCUMENT_DIRECTORY": str(
                tmp_path / "application_documents"
            ),
            "WORK_REPORT_PHOTO_DIRECTORY": str(
                tmp_path / "work_report_photos"
            ),
        }
    )


def test_login_page_has_no_local_demo_credentials(tmp_path):
    client = create_test_app(tmp_path).test_client()

    response = client.get("/")

    assert response.status_code == 200
    assert b"Demo credentials" not in response.data
    assert b"mp@sahayog.in" not in response.data
    assert b"citizen123" not in response.data
    assert b"Create an account" in response.data
    assert b"Request access" not in response.data
    assert b"Account reviewer sign-in" not in response.data
    assert b"oauthLoginBtn" in response.data
    assert len(re.findall(rb'class="role(?: is-selected)?" data-role=', response.data)) == 3
    assert b'data-role="authority"' in response.data
    assert b"MP / State / Nodal / District Authorities" in response.data
    assert b'data-role="district_authority"' not in response.data
    assert b'data-role="nodal_officer"' not in response.data


def test_dashboard_requires_a_server_authenticated_session(tmp_path):
    client = create_test_app(tmp_path).test_client()

    response = client.get("/dashboard.html")
    project_response = client.get("/projects")

    assert response.status_code == 302
    assert response.headers["Location"].endswith("/")
    assert project_response.status_code == 302
    assert project_response.headers["Location"].endswith("/")


def test_past_works_requires_an_authority_role(tmp_path):
    client = create_test_app(tmp_path).test_client()

    assert client.get("/past-works").status_code == 302
    assert client.get("/api/past-works").status_code == 403

    with client.session_transaction() as stored:
        stored["identity"] = {"role": "contractor", "profile": {}}
    assert client.get("/past-works").status_code == 403
    assert client.get("/api/past-works").status_code == 403


def test_past_works_rejects_authorities_without_verified_scope(tmp_path):
    client = create_test_app(tmp_path).test_client()
    with client.session_transaction() as stored:
        stored["identity"] = {"role": "mp", "profile": {}}

    response = client.get("/api/past-works")

    assert response.status_code == 403


def test_past_works_api_enforces_mp_scope_and_paginates(tmp_path):
    app = create_test_app(tmp_path)
    export_directory = tmp_path / "source_exports"
    export_directory.mkdir()
    app.config["HISTORICAL_WORKS_DIRECTORY"] = str(export_directory)
    completed_fields = [
        "Work ID", "Work Description", "Category", "MP Name", "Constituency",
        "State", "House", "Final Amount (₹)", "Completed Date", "Has Images",
        "Average Rating", "IDA",
    ]
    completed_rows = [
        ["A1", "School repair", "Education", "MP One", "Central", "Example State",
         "Lok Sabha", "100000", "2025-01-01", "No", "", "Example District Collector"],
        ["B2", "Road repair", "Roads", "MP Two", "Elsewhere", "Example State",
         "Lok Sabha", "200000", "2025-01-02", "No", "", "Other District Collector"],
        ["C3", "Bridge repair", "Roads", "MP Three", "Central", "Other State",
         "Lok Sabha", "300000", "2025-01-03", "No", "", "Other Collector"],
    ]
    with (export_directory / "mplads_completed_works_2026-10-24.csv").open(
        "w", encoding="utf-8-sig", newline=""
    ) as output:
        writer = csv.writer(output)
        writer.writerow(completed_fields)
        writer.writerows(completed_rows)
    recommended_fields = [
        "Work ID", "Work Description", "Category", "MP Name", "Constituency",
        "State", "House", "Recommended Amount (₹)", "Recommendation Date",
        "Has Images", "IDA",
    ]
    with (export_directory / "mplads_recommended_works_2026-10-24.csv").open(
        "w", encoding="utf-8-sig", newline=""
    ) as output:
        writer = csv.writer(output)
        writer.writerow(recommended_fields)

    client = app.test_client()
    with client.session_transaction() as stored:
        stored["identity"] = {
            "role": "mp",
            "roleLabel": "MP / Authority",
            "profile": {"state": "Example State", "constituency": "Central"},
        }
    page = client.get("/past-works")
    response = client.get("/api/past-works?state=Example%20State")
    broadened_response = client.get("/api/past-works?state=Other%20State")

    assert page.status_code == 200
    assert b"Approximate" in page.data
    assert response.status_code == 200
    assert response.json["total"] == 1
    assert [work["work_id"] for work in response.json["works"]] == ["A1"]
    assert response.json["states"] == ["Example State"]
    assert broadened_response.json["total"] == 0


def test_district_past_works_scope_uses_implementing_authority(tmp_path):
    app = create_test_app(tmp_path)
    export_directory = tmp_path / "source_exports"
    export_directory.mkdir()
    app.config["HISTORICAL_WORKS_DIRECTORY"] = str(export_directory)
    headers = [
        "Work ID", "Work Description", "Category", "MP Name", "Constituency",
        "State", "House", "Final Amount (₹)", "Completed Date", "Has Images",
        "Average Rating", "IDA",
    ]
    with (export_directory / "mplads_completed_works_2026-10-24.csv").open(
        "w", encoding="utf-8-sig", newline=""
    ) as output:
        writer = csv.writer(output)
        writer.writerow(headers)
        writer.writerows([
            ["A1", "Work in district", "", "", "", "Example State", "", "10",
             "", "", "", "Example District Collector"],
            ["B2", "Unrelated work", "", "", "", "Example State", "", "20",
             "", "", "", "Another District Collector"],
        ])
    with (export_directory / "mplads_recommended_works_2026-10-24.csv").open(
        "w", encoding="utf-8-sig", newline=""
    ) as output:
        writer = csv.writer(output)
        writer.writerow(["Work ID", "Work Description", "Category", "MP Name",
                         "Constituency", "State", "House",
                         "Recommended Amount (₹)", "Recommendation Date",
                         "Has Images", "IDA"])

    client = app.test_client()
    with client.session_transaction() as stored:
        stored["identity"] = {
            "role": "district_authority",
            "profile": {"state": "Example State", "district": "Example District"},
        }
    response = client.get("/api/past-works")

    assert response.status_code == 200
    assert [work["work_id"] for work in response.json["works"]] == ["A1"]


def test_project_creation_writes_to_supabase_when_configured(monkeypatch, tmp_path):
    class FakeSupabaseStore:
        def __init__(self):
            self.records = []

        def insert(self, table, record):
            self.records.append((table, record))
            return record

        def select(self, table, **query):
            if table == "work_projects":
                return [record for selected_table, record in self.records
                        if selected_table == table]
            return []

    fake_store = FakeSupabaseStore()
    monkeypatch.setattr(web_app, "SupabaseStore", lambda _url, _key: fake_store)
    app = create_test_app(tmp_path)
    app.config.update(
        SUPABASE_URL="https://supabase.example",
        SUPABASE_SECRET_KEY="test-only-server-key",
    )
    client = app.test_client()
    with client.session_transaction() as stored:
        stored["identity"] = {
            "subject": "authority-subject",
            "email": "mp@example.test",
            "role": "mp",
            "profile": {"state": "Example State", "constituency": "Central"},
        }
        stored["csrf_token"] = "test-csrf"

    response = client.post(
        "/api/projects",
        headers={
            "Origin": "http://localhost:5000",
            "X-CSRF-Token": "test-csrf",
        },
        json={
            "title": "School roof repair",
            "description": "Repair the school roof",
            "sanctioned_amount": 150000,
            "start_date": "2026-01-01",
            "end_date": "2026-12-31",
            "mp_name": "Example MP",
            "constituency": "Central",
            "state": "Example State",
            "district": "Central District",
            "location": "Central School",
            "contractor_email": "builder@example.test",
            "contractor_name": "Example Builder",
        },
    )

    assert response.status_code == 201
    assert fake_store.records[0][0] == "work_projects"
    assert fake_store.records[0][1]["title"] == "School roof repair"
    assert fake_store.records[0][1]["created_by_sub"] == "authority-subject"
    projects_response = client.get("/api/projects")
    assert projects_response.status_code == 200
    assert projects_response.json["projects"][0]["id"] == response.json["project_id"]


def test_authorization_redirect_uses_pkce_and_requested_role(tmp_path):
    app = create_test_app(tmp_path)
    oauth = app.extensions["sahayog.oauth"]
    oauth.keycloak.load_server_metadata = lambda: {
        "authorization_endpoint": "https://idp.example/authorize",
        "token_endpoint": "https://idp.example/token",
    }

    response = app.test_client().get("/auth/login?role=authority")
    query = parse_qs(urlparse(response.headers["Location"]).query)

    assert response.status_code == 302
    assert query["code_challenge_method"] == ["S256"]
    assert len(query["code_challenge"][0]) == 43
    assert query["client_id"] == ["sahayog-web"]
    with app.test_client() as client:
        client.get("/auth/login?role=authority")
        with client.session_transaction() as stored:
            assert stored["requested_role"] == "authority"


def test_login_redirects_to_provider_error_when_keycloak_is_unavailable(
    monkeypatch, tmp_path
):
    app = create_test_app(tmp_path)
    oauth = app.extensions["sahayog.oauth"]

    def unavailable_provider(*_args, **_kwargs):
        raise ConnectionError("Keycloak is unavailable.")

    monkeypatch.setattr(oauth.keycloak, "authorize_redirect", unavailable_provider)
    client = app.test_client()

    response = client.get("/auth/login?role=authority")

    assert response.status_code == 302
    assert response.headers["Location"].endswith("/?auth_error=provider")
    with client.session_transaction() as stored:
        assert "requested_role" not in stored


def test_keycloak_admin_request_sends_bearer_token(monkeypatch, tmp_path):
    app = create_test_app(tmp_path)
    captured = {}

    class Response:
        headers = {}

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def read(self):
            return b"[]"

    def capture_request(request, timeout):
        captured["request"] = request
        return Response()

    monkeypatch.setattr(web_app, "urlopen", capture_request)
    with app.app_context():
        web_app.keycloak_admin_request("test-admin-token", "GET", "users")

    assert captured["request"].get_header("Authorization") == "Bearer test-admin-token"
    assert captured["request"].full_url == (
        "https://idp.example/admin/realms/sahayog/users"
    )


def test_callback_requires_assigned_role_and_injects_verified_profile(monkeypatch, tmp_path):
    app = create_test_app(tmp_path)
    oauth = app.extensions["sahayog.oauth"]
    monkeypatch.setattr(
        oauth.keycloak,
        "authorize_access_token",
        lambda: {
            "userinfo": {
                "sub": "verified-subject",
                "name": "Example Authority",
                "email": "authority@example.test",
                "email_verified": True,
                "realm_access": {"roles": ["mp"]},
            }
        },
    )

    client = app.test_client()
    with client.session_transaction() as stored:
        stored["requested_role"] = "mp"

    callback = client.get("/auth/callback")
    dashboard = client.get("/dashboard.html")

    assert callback.status_code == 302
    assert callback.headers["Location"].endswith("/dashboard.html")
    assert dashboard.status_code == 200
    assert b"Example Authority" in dashboard.data
    assert b"verified-subject" in dashboard.data


def test_contractor_sign_in_opens_assigned_projects_workspace(monkeypatch, tmp_path):
    app = create_test_app(tmp_path)
    oauth = app.extensions["sahayog.oauth"]
    monkeypatch.setattr(
        oauth.keycloak,
        "authorize_access_token",
        lambda: {
            "userinfo": {
                "sub": "contractor-subject",
                "name": "Example Contractor",
                "email": "contractor@example.test",
                "email_verified": True,
                "realm_access": {"roles": ["contractor"]},
                "company_name": "Example Works",
            }
        },
    )
    client = app.test_client()
    with client.session_transaction() as stored:
        stored["requested_role"] = "contractor"

    callback = client.get("/auth/callback")
    workspace = client.get("/projects")

    assert callback.status_code == 302
    assert callback.headers["Location"].endswith("/projects")
    assert workspace.status_code == 200
    assert b'"role": "contractor"' in workspace.data
    assert b'"email": "contractor@example.test"' in workspace.data
    assert b"contractor-subject" in workspace.data


def test_authority_group_sign_in_uses_assigned_district_role(monkeypatch, tmp_path):
    app = create_test_app(tmp_path)
    oauth = app.extensions["sahayog.oauth"]
    monkeypatch.setattr(
        oauth.keycloak,
        "authorize_access_token",
        lambda: {
            "userinfo": {
                "sub": "district-subject",
                "name": "District Officer",
                "email": "district@example.test",
                "email_verified": True,
                "realm_access": {"roles": ["district_authority"]},
                "state": "Example State",
                "district": "Example District",
            }
        },
    )
    client = app.test_client()
    with client.session_transaction() as stored:
        stored["requested_role"] = "authority"

    callback = client.get("/auth/callback")
    workspace = client.get("/projects")

    assert callback.status_code == 302
    assert callback.headers["Location"].endswith("/projects")
    assert workspace.status_code == 200
    assert b'"role": "district_authority"' in workspace.data


def test_authority_group_cannot_sign_in_without_an_authority_role(monkeypatch, tmp_path):
    app = create_test_app(tmp_path)
    oauth = app.extensions["sahayog.oauth"]
    monkeypatch.setattr(
        oauth.keycloak,
        "authorize_access_token",
        lambda: {
            "userinfo": {
                "sub": "citizen-subject",
                "email": "citizen@example.test",
                "email_verified": True,
                "realm_access": {"roles": ["citizen"]},
            }
        },
    )
    client = app.test_client()
    with client.session_transaction() as stored:
        stored["requested_role"] = "authority"

    response = client.get("/auth/callback")

    assert response.headers["Location"].endswith("/?auth_error=role")
    assert client.get("/projects").headers["Location"].endswith("/")


def test_reviewer_role_cannot_sign_in(monkeypatch, tmp_path):
    app = create_test_app(tmp_path)
    oauth = app.extensions["sahayog.oauth"]
    monkeypatch.setattr(
        oauth.keycloak,
        "authorize_access_token",
        lambda: {
            "userinfo": {
                "sub": "reviewer-subject",
                "email": "reviewer@example.test",
                "email_verified": True,
                "realm_access": {"roles": ["application_reviewer"]},
            }
        },
    )
    client = app.test_client()
    with client.session_transaction() as stored:
        stored["requested_role"] = "application_reviewer"

    response = client.get("/auth/callback")

    assert response.status_code == 302
    assert response.headers["Location"].endswith("/?auth_error=role")
    with client.session_transaction() as stored:
        assert "identity" not in stored


def test_account_reviewer_sign_in_and_review_routes_are_removed(tmp_path):
    client = create_test_app(tmp_path).test_client()

    assert client.get("/auth/login?role=application_reviewer").status_code == 400
    assert client.get("/admin/applications").status_code == 404
    assert client.get("/api/admin/applications").status_code == 404
    assert client.post("/api/admin/applications/any/decision").status_code == 404


def test_registration_page_offers_self_service_without_reviewer_access(tmp_path):
    response = create_test_app(tmp_path).test_client().get("/register")

    assert response.status_code == 200
    assert b"Create your account" in response.data
    assert b"Citizen / Public User" in response.data
    assert b"pending reviewer approval" not in response.data
    assert b"Supporting documents" not in response.data


def registration_token(client):
    response = client.get("/register")
    match = re.search(rb'<meta name="csrf-token" content="([^"]+)"', response.data)
    assert match
    return match.group(1).decode()


def registration_payload(role="citizen", **fields):
    payload = {
        "role": role,
        "email": "person@example.test",
        "full_name": "Example Person",
        "phone": "+91 1234567890",
        "password": "correct horse battery staple",
        "password_confirmation": "correct horse battery staple",
    }
    if role == "ministry":
        payload.update(department="Example ministry", designation="Officer")
    payload.update(fields)
    return payload


def test_registration_creates_account_immediately_without_application_record(
    monkeypatch, tmp_path
):
    created = []
    monkeypatch.setattr(
        "web_app.provision_self_service_keycloak_account",
        lambda email, full_name, password, profile, role: created.append(
            (email, full_name, password, profile, role)
        ) or "keycloak-user-id",
    )
    app = create_test_app(tmp_path)
    client = app.test_client()
    token = registration_token(client)

    response = client.post(
        "/api/accounts",
        data=registration_payload(),
        headers={"Origin": "http://localhost:5000", "X-CSRF-Token": token},
    )

    assert response.status_code == 201
    assert response.json["status"] == "created"
    assert response.json["role"] == "citizen"
    assert "Verify your email" in response.json["message"]
    assert created[0][0:2] == ("person@example.test", "Example Person")
    assert created[0][2] == "correct horse battery staple"
    assert created[0][4] == "citizen"
    with sqlite3.connect(app.config["APPLICATION_DATABASE"]) as connection:
        assert connection.execute(
            "SELECT COUNT(*) FROM account_applications"
        ).fetchone()[0] == 0


def test_registration_immediately_assigns_the_selected_official_role(
    monkeypatch, tmp_path
):
    created = []
    monkeypatch.setattr(
        "web_app.provision_self_service_keycloak_account",
        lambda email, full_name, password, profile, role: created.append(
            (email, role, profile)
        ) or "keycloak-official-id",
    )
    client = create_test_app(tmp_path).test_client()
    token = registration_token(client)

    response = client.post(
        "/api/accounts",
        data=registration_payload(
            "ministry",
            email="officer@example.test",
            department="Example ministry",
            designation="Programme Officer",
        ),
        headers={"Origin": "http://localhost:5000", "X-CSRF-Token": token},
    )

    assert response.status_code == 201
    assert created[0][1] == "ministry"
    assert created[0][2]["department"] == "Example ministry"


def test_registration_requires_csrf_and_rejects_reviewer_role(tmp_path):
    client = create_test_app(tmp_path).test_client()
    token = registration_token(client)

    missing_csrf = client.post(
        "/api/accounts",
        data=registration_payload(),
        headers={"Origin": "http://localhost:5000"},
    )
    invalid_role = client.post(
        "/api/accounts",
        data=registration_payload("application_reviewer"),
        headers={"Origin": "http://localhost:5000", "X-CSRF-Token": token},
    )

    assert missing_csrf.status_code == 403
    assert invalid_role.status_code == 400


def test_registration_rejects_password_mismatch_before_provisioning(
    tmp_path, monkeypatch
):
    def unexpected_provision(*_args):
        raise AssertionError("Keycloak must not be called for mismatched passwords.")

    monkeypatch.setattr(
        "web_app.provision_self_service_keycloak_account", unexpected_provision
    )
    client = create_test_app(tmp_path).test_client()
    token = registration_token(client)

    response = client.post(
        "/api/accounts",
        data=registration_payload(password_confirmation="a different password"),
        headers={"Origin": "http://localhost:5000", "X-CSRF-Token": token},
    )

    assert response.status_code == 400
    assert "passwords do not match" in response.json["error"]


def test_self_service_keycloak_account_is_enabled_email_verified_and_role_assigned(
    tmp_path, monkeypatch
):
    calls = []
    monkeypatch.setattr("web_app.keycloak_admin_token", lambda: "test-token")

    def fake_admin_request(token, method, path, payload=None):
        calls.append((method, path, payload))
        if method == "GET" and path.startswith("users?"):
            return [], {}
        if method == "POST" and path == "users":
            return None, {"Location": "https://idp.example/admin/users/new-user-id"}
        if method == "GET" and path == "roles/ministry":
            return {"name": "ministry"}, {}
        if method == "POST" and path == "users/new-user-id/role-mappings/realm":
            return None, {}
        if method == "PUT" and path == "users/new-user-id/execute-actions-email":
            return None, {}
        raise AssertionError(f"Unexpected Keycloak request: {method} {path}")

    monkeypatch.setattr("web_app.keycloak_admin_request", fake_admin_request)
    app = create_test_app(tmp_path)
    from web_app import provision_self_service_keycloak_account

    with app.app_context():
        user_id = provision_self_service_keycloak_account(
            "person@example.test",
            "Example Person",
            "one time secure password",
            {"state": "Example State"},
            "ministry",
        )

    assert user_id == "new-user-id"
    create_user = next(payload for method, path, payload in calls if path == "users")
    assert create_user["enabled"] is True
    assert create_user["emailVerified"] is False
    assert create_user["requiredActions"] == ["VERIFY_EMAIL"]
    assert create_user["credentials"][0]["value"] == "one time secure password"
    assert ("POST", "users/new-user-id/role-mappings/realm", [{"name": "ministry"}]) in calls
    assert ("PUT", "users/new-user-id/execute-actions-email", ["VERIFY_EMAIL"]) in calls


def project_identity(client, role, subject, email, **profile):
    if role == "mp":
        profile = {
            "state": "Example State",
            "constituency": "Example North",
            **profile,
        }
    with client.session_transaction() as stored:
        stored["csrf_token"] = "project-test-csrf"
        stored["identity"] = {
            "role": role,
            "subject": subject,
            "email": email,
            "name": f"Example {role}",
            "shortName": f"Example {role}",
            "roles": [role],
            "profile": profile,
        }


def create_project(client, contractor_email="contractor@example.test", **overrides):
    today = date.today()
    payload = {
        "title": "Primary health centre",
        "description": "Build and equip the local health centre.",
        "sanctioned_amount": 2500000,
        "start_date": (today - timedelta(days=1)).isoformat(),
        "end_date": (today + timedelta(days=90)).isoformat(),
        "mp_name": "Example MP",
        "constituency": "Example North",
        "state": "Example State",
        "district": "Example District",
        "location": "Village One, Ward 2",
        "contractor_email": contractor_email,
        "contractor_name": "Example Works",
    }
    payload.update(overrides)
    response = client.post(
        "/api/projects",
        json=payload,
        headers={
            "Origin": "http://localhost:5000",
            "X-CSRF-Token": "project-test-csrf",
        },
    )
    return response


def test_projects_are_scoped_to_assignee_and_creator(tmp_path):
    app = create_test_app(tmp_path)
    authority = app.test_client()
    project_identity(
        authority,
        "mp",
        "mp-subject",
        "mp@example.test",
        state="Example State",
        constituency="Example North",
    )
    created = create_project(authority)
    assert created.status_code == 201

    contractor = app.test_client()
    project_identity(
        contractor,
        "contractor",
        "contractor-subject",
        "CONTRACTOR@example.test",
    )
    projects_response = contractor.get("/api/projects")
    projects = projects_response.get_json()["projects"]
    assert projects_response.headers["Cache-Control"] == "private, no-store"
    assert len(projects) == 1
    assert projects[0]["title"] == "Primary health centre"
    assert projects[0]["sanctioned_amount"] == 2500000
    assert contractor.get("/dashboard.html").headers["Location"].endswith("/projects")

    unrelated_contractor = app.test_client()
    project_identity(
        unrelated_contractor,
        "contractor",
        "other-contractor",
        "other@example.test",
    )
    assert unrelated_contractor.get("/api/projects").get_json()["projects"] == []

    another_mp = app.test_client()
    project_identity(
        another_mp,
        "mp",
        "different-mp",
        "other-mp@example.test",
        state="Different State",
        constituency="Different Seat",
    )
    assert another_mp.get("/api/projects").get_json()["projects"] == []

    district_authority = app.test_client()
    project_identity(
        district_authority,
        "district_authority",
        "district-authority",
        "district@example.test",
        state="Example State",
        district="Example District",
    )
    assert len(district_authority.get("/api/projects").get_json()["projects"]) == 1
    out_of_scope_district = app.test_client()
    project_identity(
        out_of_scope_district,
        "district_authority",
        "different-district",
        "other-district@example.test",
        state="Example State",
        district="Different District",
    )
    assert out_of_scope_district.get("/api/projects").get_json()["projects"] == []

    nodal_officer = app.test_client()
    project_identity(nodal_officer, "nodal_officer", "nodal", "nodal@example.test")
    assert len(nodal_officer.get("/api/projects").get_json()["projects"]) == 1

    state_authority = app.test_client()
    project_identity(
        state_authority,
        "state_authority",
        "state-officer",
        "state@example.test",
        state="Example State",
    )
    assert len(state_authority.get("/api/projects").get_json()["projects"]) == 1
    out_of_scope_state = app.test_client()
    project_identity(
        out_of_scope_state,
        "state_authority",
        "other-state",
        "other-state@example.test",
        state="Different State",
    )
    assert out_of_scope_state.get("/api/projects").get_json()["projects"] == []


def test_public_project_summaries_are_read_only_and_hide_private_fields(tmp_path):
    app = create_test_app(tmp_path)
    authority = app.test_client()
    project_identity(
        authority,
        "mp",
        "mp-subject",
        "mp@example.test",
        state="Example State",
        constituency="Example North",
    )
    created = create_project(authority)
    assert created.status_code == 201

    public_client = app.test_client()
    page = public_client.get("/public/projects")
    response = public_client.get("/api/public/projects")

    assert page.status_code == 200
    assert b'href="/assets/css/public-projects.css"' in page.data
    assert b'src="/assets/js/public-projects.js"' in page.data
    assert public_client.get("/assets/css/public-projects.css").status_code == 200
    assert public_client.get("/assets/js/public-projects.js").status_code == 200
    assert response.status_code == 200
    assert response.headers["Cache-Control"].startswith("public")
    public_project = response.get_json()["projects"][0]
    assert public_project["title"] == "Primary health centre"
    assert public_project["state"] == "Example State"
    assert "contractor_email" not in public_project
    assert "contractor_name" not in public_project
    assert "location" not in public_project
    assert "reports" not in public_project
    assert "messages" not in public_project
    assert public_client.post("/api/public/projects").status_code == 405


def test_public_history_page_and_exports_are_available_without_login(tmp_path):
    app = create_test_app(tmp_path)
    export_directory = tmp_path / "source_exports"
    export_directory.mkdir()
    app.config["HISTORICAL_WORKS_DIRECTORY"] = str(export_directory)
    with (export_directory / "mplads_completed_works_2026-10-24.csv").open(
        "w", encoding="utf-8", newline=""
    ) as output:
        writer = csv.writer(output)
        writer.writerow(
            [
                "Work ID",
                "Work Description",
                "Category",
                "MP Name",
                "Constituency",
                "State",
                "House",
                "Final Amount (₹)",
                "Completed Date",
                "Has Images",
                "Average Rating",
                "IDA",
            ]
        )
        writer.writerows(
            [
                [
                    "A1",
                    "Village health centre",
                    "Health",
                    "MP One",
                    "Central",
                    "Example State",
                    "Lok Sabha",
                    "100000",
                    "2025-01-01",
                    "No",
                    "",
                    "District Collector",
                ],
                [
                    "B2",
                    "Village road",
                    "Roads",
                    "MP Two",
                    "Central",
                    "Other State",
                    "Lok Sabha",
                    "250000",
                    "2025-01-02",
                    "No",
                    "",
                    "Other Collector",
                ],
            ]
        )

    client = app.test_client()
    page = client.get("/view-history")
    response = client.get("/api/public/history?dataset=completed")
    filtered = client.get(
        "/api/public/history?dataset=completed&state=Example%20State&search=health"
    )

    assert page.status_code == 200
    assert b"View History" in page.data
    assert client.get("/assets/css/view-history.css").status_code == 200
    assert client.get("/assets/js/view-history.js").status_code == 200
    assert response.status_code == 200
    assert response.headers["Cache-Control"].startswith("public")
    assert response.json["total"] == 2
    assert response.json["columns"][0] == "Work ID"
    assert response.json["records"][0]["Work Description"] == "Village health centre"
    assert response.json["amount_total"] == 350000
    assert response.json["states"] == ["Example State", "Other State"]
    assert filtered.json["total"] == 1
    assert filtered.json["records"][0]["Work ID"] == "A1"


def test_public_history_rejects_unknown_dataset_and_handles_missing_exports(tmp_path):
    app = create_test_app(tmp_path)
    app.config["HISTORICAL_WORKS_DIRECTORY"] = str(tmp_path / "empty_exports")
    client = app.test_client()

    assert client.get("/api/public/history?dataset=private").status_code == 400
    assert client.get("/api/public/history?dataset=completed").status_code == 503


def test_contractor_report_is_shared_with_authorities_and_photo_is_private(tmp_path):
    app = create_test_app(tmp_path)
    authority = app.test_client()
    project_identity(authority, "mp", "mp-subject", "mp@example.test")
    created = create_project(authority)
    assert created.status_code == 201
    project_id = created.get_json()["project_id"]

    contractor = app.test_client()
    project_identity(
        contractor,
        "contractor",
        "contractor-subject",
        "contractor@example.test",
    )
    report_date = date.today().isoformat()
    report = contractor.post(
        f"/api/projects/{project_id}/reports",
        data={
            "report_date": report_date,
            "completion_percent": "25.5",
            "hours_worked": "7.5",
            "materials": "Cement — 20 bags\nSteel — 100 kg",
            "notes": "Foundation work completed.",
            "latitude": "12.9716",
            "longitude": "77.5946",
            "photos": (BytesIO(b"\x89PNG\r\n\x1a\nsite-photo"), "site.png"),
        },
        headers={
            "Origin": "http://localhost:5000",
            "X-CSRF-Token": "project-test-csrf",
        },
        content_type="multipart/form-data",
    )
    assert report.status_code == 201

    visible_to_mp = authority.get("/api/projects").get_json()["projects"][0]
    assert len(visible_to_mp["reports"]) == 1
    saved_report = visible_to_mp["reports"][0]
    assert saved_report["completion_percent"] == 25.5
    assert saved_report["review_status"] == "pending"
    assert saved_report["materials"].startswith("Cement")
    assert saved_report["hours_worked"] == 7.5
    assert "submitted_by_email" not in saved_report
    public_project = app.test_client().get("/api/public/projects").get_json()["projects"][0]
    assert public_project["verified_completion_percent"] is None
    photo_url = saved_report["photos"][0]["url"]
    assert authority.get(photo_url).data == b"\x89PNG\r\n\x1a\nsite-photo"

    other_contractor = app.test_client()
    project_identity(other_contractor, "contractor", "other", "other@example.test")
    assert other_contractor.get(photo_url).status_code == 404
    duplicate = contractor.post(
        f"/api/projects/{project_id}/reports",
        data={
            "report_date": report_date,
            "completion_percent": "30",
            "hours_worked": "2",
            "materials": "Sand — 1 load",
            "latitude": "12",
            "longitude": "77",
            "photos": (BytesIO(b"\x89PNG\r\n\x1a\nrepeat"), "repeat.png"),
        },
        headers={
            "Origin": "http://localhost:5000",
            "X-CSRF-Token": "project-test-csrf",
        },
        content_type="multipart/form-data",
    )
    assert duplicate.status_code == 409


def test_authority_reviews_reports_and_private_project_clarifications(tmp_path):
    app = create_test_app(tmp_path)
    authority = app.test_client()
    project_identity(
        authority,
        "mp",
        "mp-subject",
        "mp@example.test",
        state="Example State",
        constituency="Example North",
    )
    created = create_project(authority)
    project_id = created.get_json()["project_id"]

    contractor = app.test_client()
    project_identity(
        contractor,
        "contractor",
        "contractor-subject",
        "contractor@example.test",
    )
    report = contractor.post(
        f"/api/projects/{project_id}/reports",
        data={
            "report_date": date.today().isoformat(),
            "completion_percent": "25",
            "hours_worked": "6",
            "materials": "Cement",
            "notes": "Foundation complete",
            "latitude": "12.9",
            "longitude": "77.5",
            "photos": (BytesIO(b"\x89PNG\r\n\x1a\nreport-photo"), "site.png"),
        },
        headers={
            "Origin": "http://localhost:5000",
            "X-CSRF-Token": "project-test-csrf",
        },
        content_type="multipart/form-data",
    )
    report_id = report.get_json()["report_id"]
    review_url = f"/api/projects/{project_id}/reports/{report_id}/review"
    clarification = authority.post(
        review_url,
        json={"status": "clarification_requested", "note": "Please clarify the material quantity."},
        headers={
            "Origin": "http://localhost:5000",
            "X-CSRF-Token": "project-test-csrf",
        },
    )
    assert clarification.status_code == 200

    contractor_projects = contractor.get("/api/projects").get_json()["projects"]
    assert contractor_projects[0]["reports"][0]["review_status"] == "clarification_requested"
    assert contractor_projects[0]["reports"][0]["review_note"] == "Please clarify the material quantity."
    assert contractor_projects[0]["reports"][0].get("reviewed_by_sub") is None

    authority_message = authority.post(
        f"/api/projects/{project_id}/messages",
        json={
            "message_type": "clarification_request",
            "message": "Please explain the material quantity before approval.",
        },
        headers={
            "Origin": "http://localhost:5000",
            "X-CSRF-Token": "project-test-csrf",
        },
    )
    assert authority_message.status_code == 201
    contractor_message = contractor.post(
        f"/api/projects/{project_id}/messages",
        json={
            "message_type": "clarification_response",
            "message": "The total includes materials used on the completed foundation.",
        },
        headers={
            "Origin": "http://localhost:5000",
            "X-CSRF-Token": "project-test-csrf",
        },
    )
    assert contractor_message.status_code == 201

    thread = authority.get("/api/projects").get_json()["projects"][0]["messages"]
    assert [message["message_type"] for message in thread] == [
        "clarification_request",
        "clarification_response",
    ]
    assert "sender_email" not in thread[0]

    accept = authority.post(
        review_url,
        json={"status": "approved", "note": ""},
        headers={
            "Origin": "http://localhost:5000",
            "X-CSRF-Token": "project-test-csrf",
        },
    )
    assert accept.status_code == 200
    final_reports = contractor.get("/api/projects").get_json()["projects"][0]["reports"]
    assert final_reports[0]["review_status"] == "approved"
    public_project = app.test_client().get("/api/public/projects").get_json()["projects"][0]
    assert public_project["verified_completion_percent"] == 25

    unrelated_contractor = app.test_client()
    project_identity(
        unrelated_contractor,
        "contractor",
        "unrelated-subject",
        "unrelated@example.test",
    )
    forbidden = unrelated_contractor.post(
        f"/api/projects/{project_id}/messages",
        json={"message_type": "message", "message": "Not assigned"},
        headers={
            "Origin": "http://localhost:5000",
            "X-CSRF-Token": "project-test-csrf",
        },
    )
    assert forbidden.status_code == 404


def test_only_authorities_can_assign_and_dates_must_fit_schedule(tmp_path):
    app = create_test_app(tmp_path)
    contractor = app.test_client()
    project_identity(contractor, "contractor", "contractor", "contractor@example.test")

    forbidden = create_project(contractor)
    assert forbidden.status_code == 403
    workspace = contractor.get("/projects")
    assert workspace.status_code == 200
    assert workspace.headers["Cache-Control"] == "no-store"
    assert b"window.SahayogSession" in workspace.data
    assert b"Submit progress report" in workspace.data
    assert contractor.get("/assets/js/project-workflow.js").status_code == 200

    authority = app.test_client()
    project_identity(authority, "mp", "mp-subject", "mp@example.test")
    created = create_project(authority)
    project_id = created.get_json()["project_id"]
    outside_schedule = contractor.post(
        f"/api/projects/{project_id}/reports",
        data={
            "report_date": (date.today() + timedelta(days=100)).isoformat(),
            "completion_percent": "10",
            "hours_worked": "1",
            "materials": "Sand — 1 load",
            "latitude": "12",
            "longitude": "77",
            "photos": (BytesIO(b"\x89PNG\r\n\x1a\ninvalid-date"), "site.png"),
        },
        headers={
            "Origin": "http://localhost:5000",
            "X-CSRF-Token": "project-test-csrf",
        },
        content_type="multipart/form-data",
    )
    assert outside_schedule.status_code == 400
