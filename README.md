# Sahayog — MPLADS Project Monitoring

Sahayog is a web portal and project-risk review prototype for monitoring
Member of Parliament Local Area Development Scheme (MPLADS) works. It combines
public project and historical-work dashboards with role-based project
assignment, contractor progress reporting, and rule-based review signals.

> **Important:** Risk flags are indicators for human review, not proof of
> fraud, a calibrated probability, or a substitute for an official audit.
> The included Docker Compose configuration is for local development. Review
> [AUTHENTICATION.md](AUTHENTICATION.md) before deploying or publishing data.

## What it includes

- Public dashboards for current projects and historical MPLADS works.
- Keycloak OpenID Connect sign-in through a Flask web application.
- Role-aware project assignment and contractor progress reports, including
  photo attachments and review conversations.
- Optional Supabase/PostgreSQL storage for application and project records;
  local SQLite and file storage are used when Supabase is not configured.
- A separate Python assessment pipeline that checks project expenditure,
  progress, similar or duplicate projects, BOQ costs, tenders, and contractor
  history when those datasets are provided.

## Technology

- Python, Flask, pandas, NumPy, and scikit-learn
- Keycloak for identity and sign-in
- Optional Supabase/PostgreSQL storage
- HTML, CSS, and JavaScript for the web interface

## Run locally on Windows

### 1. Install Python dependencies

From the `MPLADS` project directory, open PowerShell and run:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

### 2. Configure local secrets

Create a local environment file:

```powershell
Copy-Item .env.example .env
```

Edit `.env` and set unique values for `SAHAYOG_SECRET_KEY`,
`KEYCLOAK_ADMIN_USERNAME`, and `KEYCLOAK_ADMIN_PASSWORD`. Generate an
application secret with:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Keep `.env` private. Do not paste its values into GitHub, issues, screenshots,
or chat. `.env.example` contains variable names and safe local defaults, not
working credentials.

### 3. Start Keycloak

Docker Desktop must be running. In the project directory:

```powershell
docker compose up -d
```

For local development, Keycloak is available at `http://localhost:8080` and
imports the supplied `sahayog` realm. Configure working SMTP settings in the
Keycloak admin console so new accounts can verify their email.

### 4. Start the web application

In a second PowerShell window, activate the virtual environment if needed and
run:

```powershell
.\.venv\Scripts\Activate.ps1
python web_app.py
```

Open [http://localhost:5000](http://localhost:5000). Use the application URL
rather than opening the HTML files directly; sign-in and server-side sessions
require Flask.

The local realm allows self-service role selection. Do not expose this
development setup to the public internet without reviewing the role and
registration policy, HTTPS, secret management, and deployment guidance in
[AUTHENTICATION.md](AUTHENTICATION.md).

## Run the risk assessment pipeline

The command-line assessment reads `data/projects.csv` and optionally reads
`boq.csv`, `tenders.csv`, and `contractor_history.csv` from the selected data
folder. It writes a JSON report to `reports/risk_report.json` by default:

```powershell
python app.py
```

To select a different dataset directory or output file:

```powershell
python app.py --data-dir path\to\your\data --output path\to\report.json
```

Use only datasets you are authorized to process. Check the generated report
before sharing it; it may contain project-level information from its inputs.

## Tests

Run the test suite from the project directory:

```powershell
python -m pytest
```

## Project layout

```text
MPLADS/
├── app.py                  # Command-line risk assessment pipeline
├── web_app.py              # Flask portal
├── data/                   # Example and dashboard source datasets
├── src/                    # Data loading, normalization, and risk detectors
├── web/                    # HTML, CSS, JavaScript, and dashboard data builder
├── keycloak/               # Local Keycloak realm configuration
├── supabase/migrations/    # Database schema migrations
├── tests/                  # Automated tests
├── reports/                # Risk assessment output
└── AUTHENTICATION.md       # Sign-in, storage, migration, and deployment guide
```
