import os
from urllib.parse import parse_qs, urlparse

os.environ.setdefault("SAHAYOG_SECRET_KEY", "test-only-secret")

from web_app import create_app


def create_test_app():
    return create_app(
        {
            "TESTING": True,
            "SECRET_KEY": "test-session-secret",
            "PUBLIC_BASE_URL": "http://localhost:5000",
            "KEYCLOAK_ISSUER": "https://idp.example/realms/sahayog",
        }
    )


def test_login_page_has_no_local_demo_credentials():
    client = create_test_app().test_client()

    response = client.get("/")

    assert response.status_code == 200
    assert b"Demo credentials" not in response.data
    assert b"mp@sahayog.in" not in response.data
    assert b"citizen123" not in response.data
    assert b"oauthLoginBtn" in response.data


def test_dashboard_requires_a_server_authenticated_session():
    client = create_test_app().test_client()

    response = client.get("/dashboard.html")

    assert response.status_code == 302
    assert response.headers["Location"].endswith("/")


def test_authorization_redirect_uses_pkce_and_requested_role():
    app = create_test_app()
    oauth = app.extensions["sahayog.oauth"]
    oauth.keycloak.load_server_metadata = lambda: {
        "authorization_endpoint": "https://idp.example/authorize",
        "token_endpoint": "https://idp.example/token",
    }

    response = app.test_client().get("/auth/login?role=mp")
    query = parse_qs(urlparse(response.headers["Location"]).query)

    assert response.status_code == 302
    assert query["code_challenge_method"] == ["S256"]
    assert len(query["code_challenge"][0]) == 43
    assert query["client_id"] == ["sahayog-web"]


def test_callback_requires_assigned_role_and_injects_verified_profile(monkeypatch):
    app = create_test_app()
    oauth = app.extensions["sahayog.oauth"]
    monkeypatch.setattr(
        oauth.keycloak,
        "authorize_access_token",
        lambda: {
            "userinfo": {
                "sub": "verified-subject",
                "name": "Example Authority",
                "email": "authority@example.test",
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


def test_user_cannot_claim_unassigned_mp_role(monkeypatch):
    app = create_test_app()
    oauth = app.extensions["sahayog.oauth"]
    monkeypatch.setattr(
        oauth.keycloak,
        "authorize_access_token",
        lambda: {
            "userinfo": {
                "sub": "citizen-subject",
                "name": "Example Citizen",
                "realm_access": {"roles": ["citizen"]},
            }
        },
    )

    client = app.test_client()
    with client.session_transaction() as stored:
        stored["requested_role"] = "mp"

    response = client.get("/auth/callback")

    assert response.status_code == 302
    assert response.headers["Location"].endswith("/?auth_error=role")
    assert client.get("/dashboard.html").headers["Location"].endswith("/")


def test_logout_requires_same_origin_and_clears_session():
    client = create_test_app().test_client()
    with client.session_transaction() as stored:
        stored["identity"] = {"role": "citizen", "subject": "test"}

    rejected = client.post(
        "/auth/logout",
        headers={"Origin": "https://attacker.example"},
    )
    accepted = client.post(
        "/auth/logout",
        headers={"Origin": "http://localhost:5000"},
    )

    assert rejected.status_code == 403
    assert accepted.status_code == 302
    assert client.get("/dashboard.html").headers["Location"].endswith("/")
