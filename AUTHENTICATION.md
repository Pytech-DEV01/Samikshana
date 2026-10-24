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
   credentials from `.env`, and assign application roles only to verified
   accounts. The local `sahayog` realm has email sign-in and verified-email
   enforcement enabled. Supported realm roles are `citizen`, `mp`, `contractor`,
   `state_authority`, `district_authority`, `nodal_officer`, `ministry`, and
   `application_reviewer`. MP, Contractor, State Authority, District Authority,
   Nodal Officer, and MoSPI/Ministry account requests are submitted through
   `http://localhost:5000/register`. Sign-in has three choices (User, Contractor,
   and the grouped authority option); account requests still ask which specific
   official role is needed so it can be reviewed and assigned accurately.

5. Start the Sahayog web app in a second terminal:

   ```powershell
   python web_app.py
   ```

6. Open `http://localhost:5000`. Do not open `web/index.html` directly using
   `file://`; OAuth callbacks and server-side sessions require the Flask app.

The access-level choice on the sign-in page is not an authorization grant.
Email sign-in requires a verified Keycloak email. The sign-in page presents
three account types: User, Contractor, and MP/State/Nodal/District Authorities.
The authority choice accepts an approved MP, State Authority, District
Authority, Nodal Officer, or Ministry role claim; the verified Keycloak role
still determines the account's actual permissions and scope. An authenticated
account without an elevated role can sign in as a User.

## Account request review

Applicants submit their email, password, profile, and optionally
PDF/JPEG/PNG supporting documents at `http://localhost:5000/register`. A proof
document is not required for any account type. The password is sent directly
to Keycloak over the server-side Admin API and is never stored in the
application database.
Keycloak creates a disabled, unverified account until review. Application
records are stored in the Flask instance database at
`instance/account_applications.sqlite3`; supporting documents are stored
outside the static web directory at `instance/application_documents/`. Only a
Keycloak account with the `application_reviewer` realm role can open
`http://localhost:5000/admin/applications` or preview/download submitted
documents.
To create a reviewer, create a trusted operator account in the Keycloak admin
console, verify its email, and explicitly assign the `application_reviewer`
realm role. Do not assign this role to applicants or ordinary portal accounts.

The reviewer page shows the submitted application information and previews
any optionally uploaded PDF/image documents. Reviewers may accept or reject
based on the submitted information; an attached proof document is not
required. Approval assigns the requested realm role, writes the reviewed
profile attributes, marks the reviewed email verified, and enables the
applicant's pre-provisioned Keycloak account, so the contractor can sign in
with the email and password they registered. The approved contractor profile
is then available for project assignment. Rejection retains the application
decision for review history and deletes the disabled pending Keycloak account.
District authority scope is the verified district; State Authority scope is
the verified state; Nodal Officer and MoSPI/Ministry scopes are national.
Applications submitted before this provisioning flow have no linked pending
Keycloak account; they must be handled separately by an administrator.

Configure `KEYCLOAK_ADMIN_USERNAME` and `KEYCLOAK_ADMIN_PASSWORD` for the Flask
server; the account workflow uses these server-only credentials to provision
pending users and activate approved accounts. Keep them out of client-side
code and logs. Use HTTPS in production because a new password is submitted
once to the Flask server and forwarded to Keycloak without being persisted.

For a production deployment, replace local document storage with encrypted,
access-controlled storage and define a retention/deletion policy. Protect
application metadata and official documents as sensitive personal data.
The dashboard's bundled static MPLADS dataset remains public to anyone who can
load the site; account roles do not currently filter or restrict those static
records.

The bundled Keycloak realm export maps the reviewed profile fields into OIDC
claims. If the `sahayog` realm was created before those mappers were added,
import the client mappers into the existing `sahayog-web` client or recreate
the local development realm before approving accounts that need scoped
project access.

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

Unauthenticated visitors can browse the read-only high-level project summaries
at `http://localhost:5000/public/projects`. The public endpoint returns only
project title, MP/constituency, district/state, sanctioned amount, schedule,
and accepted progress. It omits contractor identity/contact information,
descriptions, exact locations, submitted reports/photos, review notes, and
private conversations. Pending or rejected progress is not shown as verified
public progress. Public clients have no project create, report, review, or
delete endpoint.

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
settings present, new account applications and their private documents,
approved user profiles, contractor records, assigned projects, progress
reports, and private report photos are written to Supabase. Account review and
project lists read the Supabase records. If either server setting is missing,
the app continues using its existing local SQLite and file-storage behavior.

Run `python run_migration.py` after adding the server database password or
connection string to apply the complete schema and
`003_keycloak_review_identity.sql` and
`004_project_reviews_and_messages.sql`. The latest migration adds review state
to work reports and a private project conversation table. Existing SQLite rows
and Keycloak users are not automatically migrated; back them up and migrate
them separately before switching a production deployment. Rotate any Supabase
secret key that has been shared outside the project's secret manager.
