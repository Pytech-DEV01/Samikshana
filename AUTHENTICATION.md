# Sahayog sign-in setup

Sahayog uses **Keycloak** as its open-source OpenID Connect identity provider.
The Flask application is the OAuth client. User passwords are entered only on
Keycloak's sign-in page; they are never collected or stored by the Sahayog
frontend.

## Local development

1. Install the Python dependencies:

   ```powershell
   python -m pip install -r requirements.txt
   ```

2. Create a private `.env` file from `.env.example`. Set unique values for
   `SAHAYOG_SECRET_KEY`, `KEYCLOAK_ADMIN_USERNAME`, and
   `KEYCLOAK_ADMIN_PASSWORD`. For a random application secret, run:

   ```powershell
   python -c "import secrets; print(secrets.token_urlsafe(48))"
   ```

3. Start the local Keycloak instance:

   ```powershell
   docker compose up -d
   ```

   Keycloak imports the `sahayog` realm and `sahayog-web` public client on first
   startup. This compose configuration is for local development only; Keycloak
   runs in development mode over HTTP.

4. Open `http://localhost:8080`, sign in with the Keycloak administrator
   credentials from `.env`, and create users in the `sahayog` realm. Set a
   password for each user and assign one of the realm roles `citizen`, `mp`, or
   `contractor`. Users choosing MP or Contractor on the Sahayog sign-in page
   must have the corresponding role assigned in Keycloak.

5. Start the Sahayog web app in a second terminal:

   ```powershell
   python web_app.py
   ```

6. Open `http://localhost:5000`. Do not open `web/index.html` directly using
   `file://`; OAuth callbacks and server-side sessions require the Flask app.

The access-level choice on the sign-in page is not an authorization grant.
Keycloak's verified role claims determine whether an MP or Contractor sign-in
is accepted; an authenticated account without either elevated role can sign in
as a Citizen.

## Production

Use HTTPS for both the application and Keycloak. Set `PUBLIC_BASE_URL`,
`KEYCLOAK_ISSUER`, and the Keycloak client's redirect URI/web origin to the
real HTTPS origins. Use a production Keycloak deployment with durable storage
and strong administrator credentials. Provide `SAHAYOG_SECRET_KEY` using the
deployment secret manager, never a committed file. Configure a trusted reverse
proxy and secure cookies before exposing the service.

Sign-out clears the Sahayog application session. Keycloak's own browser session
may remain active, so the next sign-in can use Keycloak single sign-on.

## Dataset imports

The original dated MPLADS CSV and JSON exports are kept in
`data/source_exports/`. Regenerate the dashboard data asset after replacing an
export:

```powershell
python web/build_dashboard_data.py --source-dir data/source_exports --output web/assets/js/dashboard-data.js
```

The supplied `data/boq.csv` is empty and is not one of these exports; it remains
unchanged.
