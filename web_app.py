"""Run the Sahayog web interface with Keycloak OpenID Connect sign-in."""

import json
import logging
import os
from datetime import timedelta
from pathlib import Path
from urllib.parse import urlsplit

from authlib.common.security import generate_token
from authlib.integrations.base_client.errors import OAuthError
from authlib.integrations.flask_client import OAuth
from dotenv import load_dotenv
from flask import (
    Flask,
    abort,
    current_app,
    redirect,
    request,
    send_from_directory,
    session,
    url_for,
)


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
}


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
        PUBLIC_BASE_URL=os.environ.get(
            "PUBLIC_BASE_URL", "http://localhost:5000"
        ).rstrip("/"),
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Lax",
        SESSION_COOKIE_SECURE=os.environ.get(
            "PUBLIC_BASE_URL", "http://localhost:5000"
        ).startswith("https://"),
        PERMANENT_SESSION_LIFETIME=timedelta(hours=8),
    )
    if test_config:
        app.config.update(test_config)
    if not app.config.get("SECRET_KEY"):
        raise RuntimeError(
            "Set SAHAYOG_SECRET_KEY in the environment or the project .env file."
        )

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

    @app.get("/")
    def index():
        if session.get("identity"):
            return redirect("/dashboard.html")
        response = send_from_directory(WEB_DIR, "index.html")
        response.headers["Cache-Control"] = "no-store"
        return response

    @app.get("/dashboard.html")
    def dashboard():
        identity = session.get("identity")
        if not identity or identity.get("role") not in ROLES:
            return redirect("/")

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
        if requested_role not in ROLES:
            abort(400, "Unknown Sahayog access level.")
        if session.get("identity"):
            return redirect("/dashboard.html")

        session["requested_role"] = requested_role
        redirect_uri = f'{app.config["PUBLIC_BASE_URL"]}/auth/callback'
        return oauth.keycloak.authorize_redirect(
            redirect_uri,
            code_verifier=generate_token(48),
        )

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

        role_claims = set(userinfo.get("realm_access", {}).get("roles", []))
        client_roles = (
            userinfo.get("resource_access", {})
            .get(app.config["KEYCLOAK_CLIENT_ID"], {})
            .get("roles", [])
        )
        role_claims.update(client_roles)

        requested_role = session.pop("requested_role", "citizen")
        if requested_role != "citizen" and requested_role not in role_claims:
            current_app.logger.info(
                "Authenticated user lacks requested Sahayog role %s.",
                requested_role,
            )
            return redirect("/?auth_error=role")

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
        }
        session.clear()
        session.permanent = True
        session["identity"] = identity
        return redirect("/dashboard.html")

    @app.post("/auth/logout")
    def logout():
        origin = request.headers.get("Origin")
        referer = request.headers.get("Referer")
        source = origin or referer
        expected_host = urlsplit(current_app.config["PUBLIC_BASE_URL"]).netloc
        if not source or urlsplit(source).netloc != expected_host:
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
