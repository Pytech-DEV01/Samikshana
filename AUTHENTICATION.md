# Sahayog sign-in setup

Sahayog uses **Keycloak** as its open-source OpenID Connect identity provider.
The Flask application is the OAuth client. During sign-in, passwords are
entered on Keycloak's page. During registration, the password is sent to the
Flask server and forwarded to Keycloak without being stored by Sahayog.

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

4. Configure outgoing email for the `sahayog` realm in the Keycloak admin
   console. Sahayog sends new users a Keycloak email-verification message and
   does not allow sign-in until the email is verified. Supported self-service
   account roles are `citizen`, `mp`, `contractor`, `state_authority`,
   `district_authority`, `nodal_officer`, and `ministry`.

5. Start the Sahayog web app in a second terminal:

   ```powershell
   python web_app.py
   ```

6. Open `http://localhost:5000`. Do not open `web/index.html` directly using
   `file://`; OAuth callbacks and server-side sessions require the Flask app.

## Self-service accounts

Visitors can create a Citizen, Contractor, MP, State Authority, District
Authority, Nodal Officer, or Ministry account at
`http://localhost:5000/register`. Accounts are enabled and assigned the
selected Keycloak role immediately. Official and contractor profile fields
are stored as Keycloak attributes and used to scope the portal. Because role
selection is self-service, use this deployment only when that registration
policy is intended; otherwise restrict registration or add an independent
verification policy before production.

Keycloak requires the user to verify their email before sign-in. Configure
working SMTP settings in the realm's email settings; registration fails and
removes the partially created Keycloak account if the verification message
cannot be sent. The password is forwarded to Keycloak through the server-side
Admin API and is never stored by Sahayog. Configure
`KEYCLOAK_ADMIN_USERNAME` and `KEYCLOAK_ADMIN_PASSWORD` for that server-only
API access, and use HTTPS in production.

Account-reviewer sign-in and the application-review interface are no longer
available. Existing application records and uploaded documents are not
automatically deleted by this change.

The dashboard's bundled static MPLADS dataset remains public to anyone who can
load the site; account roles do not currently filter or restrict those static
records.
The dashboard's bundled static MPLADS dataset remains public to anyone who can
load the site; account roles do not currently filter or restrict those static
records.

The bundled Keycloak realm export maps profile fields into OIDC claims. If the
`sahayog` realm was created before those mappers were added, import the client
mappers into the existing `sahayog-web` client or recreate the local
development realm before creating accounts that need scoped project access.

## Project assignments and contractor progress reports

MP, State Authority, District Authority, Nodal Officer, and MoSPI/Ministry accounts open the
project workspace at `http://localhost:5000/projects`. Authorized users can
create an assignment with its sanctioned amount, start/end dates, MP,
constituency, state, district, work location, and the approved contractor's
Keycloak email. MP assignments are restricted to the verified state and
constituency profile attributes, and MPs can view projects for their verified
state and constituency. State Authority assignments and visibility are
restricted to the verified state; District Authority assignments and visibility
are restricted to the verified state and district. Nodal Officer and
MoSPI/Ministry roles can view and assign projects nationally. Keep those
Keycloak profile attributes accurate and mapped into OIDC userinfo.

Contractors see only assignments whose contractor email matches their verified
Keycloak email. Each project's date picker is bounded by its assignment period.
A contractor can submit one dated, cumulative report per project per day,
including completion percentage, hours, materials, notes, browser-captured
coordinates, and up to four JPEG/PNG site photos. Cumulative completion cannot
decrease between reports. Reports are stored as pending review; authorized
officials within the project's scope can accept, reject, or request
clarification. Rejections and clarification requests require a note, and a
final accepted or rejected decision cannot be changed. The contractor sees the
decision and note. Each project also has a private conversation where in-scope
officials and the assigned contractor can exchange review notes and
clarification responses. Other contractors and public visitors cannot access
these threads or private report photos. Location coordinates come from the
browser and are not proof of physical presence. Files and project records use
the configured Supabase database/private Storage when enabled, otherwise they
remain in the Flask instance database and `instance/work_report_photos/`.

Unauthenticated visitors can browse read-only current project summaries at
`http://localhost:5000/public/projects` and the published historical exports
through **View History** at `http://localhost:5000/view-history`. The history
dashboard exposes the source columns for completed works, recommended works,
expenditure records, and MP summaries with search, state filters, and
pagination. This source data is separate from private contractor reports and
project conversations; it does not grant public project create, report, review,
or delete access.

The published completed/recommended work exports provide location descriptions
and administrative area names but contain no verified latitude/longitude
coordinates. The history dashboard can search those place descriptions on a
map, but that result is approximate and must not be treated as an exact site
pin. Exact coordinates can only be shown when verified coordinates are present
in the source data. Current assigned-project summaries continue to omit the
project's submitted exact location and contractor information.

## Historical works

Authority accounts can open the separate historical works page at
`http://localhost:5000/past-works`. The server filters the dated completed and
recommended MPLADS exports in `data/source_exports/`: MPs need a verified state
and constituency, District Authorities need a verified state and district
matched against the export's `IDA` (implementing authority) field, and State
Authorities need a verified state. Nodal Officer and MoSPI/Ministry accounts
can search nationally. Missing geographic profile attributes fail closed; have
an administrator verify and map the relevant Keycloak profile claims.

The exports do not include verified work-site coordinates or contractor contact
details. Map actions open a Google Maps search using the work description and
recorded place/authority names; the search result is approximate, not a verified
contract-site pin. Replace or supplement the source data with verified
coordinates before presenting exact locations.

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

## Supabase database schema

The complete database schema is in
`supabase/migrations/002_complete_schema.sql`. It creates application profiles,
external identity mappings, contractor records and private document references,
account applications, MPLADS source-data tables, assigned projects and
progress reports, tenders, BOQs, contractor history, anomaly scores, audit
records, and private Storage buckets. Public access is limited to the MPLADS
source tables; application, contractor, and field-report data require
server-side access.

Keycloak remains the sign-in provider. `user_identities` maps a Keycloak
subject to a `user_profiles` row; passwords stay in Keycloak and must never be
copied into Supabase. `user_profiles.role` is server-managed. Assign elevated
roles only from a trusted server using the Supabase secret key, not from
client-editable profile data.

Apply the schema by running the SQL file in the Supabase Dashboard's SQL Editor,
or set `SUPABASE_DB_PASSWORD` in the local, ignored `.env` file and run:

```powershell
python run_migration.py
```

`SUPABASE_DB_PASSWORD` is the PostgreSQL database password from the project's
database settings. It is different from the publishable and secret API keys.
Alternatively, set `SUPABASE_DB_URL` to a PostgreSQL connection string. Never
commit either value or expose the Supabase secret key in browser code.

To connect the Flask server, set `SUPABASE_URL` and `SUPABASE_SECRET_KEY` in
the ignored local `.env` file or deployment secret manager. The secret key is
used only by server-side code and must never be sent to the browser. The
publishable key is not sufficient for private application writes. With both
settings present, self-service user profiles, contractor records, assigned
projects, progress reports, and private report photos are written to Supabase.
Existing application-review tables and records remain for historical
compatibility, but the review interface is disabled. If either server setting
is missing, the app continues using its existing local SQLite and file-storage
behavior.

Run `python run_migration.py` after adding the server database password or
connection string to apply the complete schema and
`003_keycloak_review_identity.sql` and
`004_project_reviews_and_messages.sql`. The latest migration adds review state
to work reports and a private project conversation table. Existing SQLite rows
and Keycloak users are not automatically migrated; back them up and migrate
them separately before switching a production deployment. Rotate any Supabase
secret key that has been shared outside the project's secret manager.
