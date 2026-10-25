(function () {
  const { ROLES } = SahayogAuth;
  const {
    PROJECTS,
    CONTRACTORS,
    MATERIALS,
    UNITS,
    NOTICES,
    SEED_UPDATES
  } = SahayogData;

  const session = SahayogAuth.requireSession();
  if (!session) return;

  const role = session.role;
  const roleMeta = ROLES[role];
  const isCitizen = role === "citizen";
  const isMP = role === "mp";
  const isContractor = role === "contractor";

  /* ---------------- storage ---------------- */

  const KEYS = {
    updates: "sahayog.updates",
    reviews: "sahayog.reviews",
    projectFlags: "sahayog.projectFlags",
    projectReviews: "sahayog.projectReviews",
    issues: "sahayog.issues",
    overrides: "sahayog.overrides"
  };

  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function save(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      return false;
    }
  }

  /* ---------------- icons ---------------- */

  const ICONS = {
    overview: '<path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/>',
    projects: '<path d="M4 6.5h16M4 12h16M4 17.5h10"/>',
    alerts:
      '<path d="M12 3 4.5 6v5.5c0 4.5 3.2 8.7 7.5 9.5 4.3-.8 7.5-5 7.5-9.5V6L12 3Z"/><path d="M12 9v4M12 16.2v.1"/>',
    updates:
      '<path d="M3.5 12a8.5 8.5 0 1 0 2.8-6.3L3.5 8.2"/><path d="M3.5 4v4.2h4.2"/><path d="M12 7.8V12l3 1.8"/>',
    notices:
      '<path d="M4 10v4a2 2 0 0 0 2 2h1l7 4V4L7 8H6a2 2 0 0 0-2 2Z"/><path d="M18 9.2a4 4 0 0 1 0 5.6"/>',
    rupee: '<path d="M7 5h10M7 9.2h10M15 5c0 3.6-2.9 4.9-5.6 5.1L15 19"/>',
    calendar:
      '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3.4v3.2M16 3.4v3.2"/>',
    pin: '<path d="M12 21s7-5.7 7-11a7 7 0 1 0-14 0c0 5.3 7 11 7 11Z"/><circle cx="12" cy="10" r="2.6"/>',
    user: '<circle cx="12" cy="8" r="3.4"/><path d="M5 20a7 7 0 0 1 14 0"/>',
    building:
      '<path d="M4 21h16M6 21V5.6A1.6 1.6 0 0 1 7.6 4h4.8A1.6 1.6 0 0 1 14 5.6V21"/><path d="M14 10h3.4A1.6 1.6 0 0 1 19 11.6V21"/><path d="M8.6 8h2.6M8.6 12h2.6M8.6 16h2.6"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.4V12l3 1.8"/>',
    camera:
      '<path d="M4 8.6h3l1.5-2.1h7L17 8.6h3a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Z"/><circle cx="12" cy="13.6" r="3.2"/>',
    upload:
      '<path d="M12 16.2V5"/><path d="m7.6 9.4 4.4-4.4 4.4 4.4"/><path d="M4.6 16v2.4a1 1 0 0 0 1 1h12.8a1 1 0 0 0 1-1V16"/>',
    plus: '<path d="M12 5.2v13.6M5.2 12h13.6"/>',
    trash:
      '<path d="M4.6 7h14.8M9.6 7V5.6A1.6 1.6 0 0 1 11.2 4h1.6a1.6 1.6 0 0 1 1.6 1.6V7"/><path d="m6.6 7 1 13h8.8l1-13"/>',
    back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    forward: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    check: '<path d="M20 6.5 9.2 17.3 4 12.1"/>',
    flag: '<path d="M5.6 21V4.4"/><path d="M5.6 5.4h11l-1.7 3.7 1.7 3.7h-11"/>',
    chevronLeft: '<path d="m14.4 6-6 6 6 6"/>',
    chevronRight: '<path d="m9.6 6 6 6-6 6"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.2M12 7.9v.1"/>',
    doc: '<path d="M7 3.6h7L18.4 8v12.4H7z"/><path d="M13.6 3.6V8.4h4.8"/><path d="M9.6 13h5.8M9.6 16.4h4"/>',
    layers:
      '<path d="m12 4 8 4.2-8 4.2-8-4.2L12 4Z"/><path d="m4 12.8 8 4.2 8-4.2"/><path d="m4 16.6 8 4.2 8-4.2"/>',
    eye: '<path d="M2.6 12S6.2 5.9 12 5.9 21.4 12 21.4 12 17.8 18.1 12 18.1 2.6 12 2.6 12Z"/><circle cx="12" cy="12" r="3"/>',
    search: '<circle cx="11" cy="11" r="6.4"/><path d="m15.8 15.8 4.4 4.4"/>',
    chart: '<path d="M4.5 20V9.5M10 20V4.5M15.5 20v-6.5M21 20H3"/>',
    tools:
      '<path d="M14.6 6.4a3.9 3.9 0 0 0 5.1 5.1l-8.5 8.5a2.6 2.6 0 0 1-3.6-3.6l8.5-8.5Z"/>',
    shield:
      '<path d="M12 3 4.5 6v5.5c0 4.5 3.2 8.7 7.5 9.5 4.3-.8 7.5-5 7.5-9.5V6L12 3Z"/><path d="m9 12 2.2 2.2L15.5 10"/>',
    down: '<path d="M12 4.5v14M6.5 13l5.5 5.5L17.5 13"/>',
    box: '<path d="M4 8.5 12 4l8 4.5v7L12 20l-8-4.5v-7Z"/><path d="M4 8.5 12 13l8-4.5M12 13v7"/>'
  };

  function icon(name) {
    return (
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      (ICONS[name] || "") +
      "</svg>"
    );
  }

  /* ---------------- formatting ---------------- */

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function trimNum(value) {
    return String(Math.round(value * 100) / 100)
      .replace(/\.00$/, "")
      .replace(/(\.\d)0$/, "$1");
  }

  function money(value) {
    return "₹" + Number(value || 0).toLocaleString("en-IN");
  }

  function moneyShort(value) {
    const n = Number(value || 0);
    if (n >= 1e7) return "₹" + trimNum(n / 1e7) + " Cr";
    if (n >= 1e5) return "₹" + trimNum(n / 1e5) + " L";
    return money(n);
  }

  function parseISO(iso) {
    return new Date(String(iso).slice(0, 10) + "T00:00:00");
  }

  function isoOf(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
  }

  function todayISO() {
    return isoOf(new Date());
  }

  function monthStartISO(iso) {
    return String(iso).slice(0, 7) + "-01";
  }

  function fmtDate(iso) {
    if (!iso) return "—";
    return parseISO(iso).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric"
    });
  }

  function fmtDateTime(value) {
    if (!value) return "—";
    return new Date(value).toLocaleString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function dayDiff(fromISO, toISO) {
    return Math.round(
      (parseISO(toISO) - parseISO(fromISO)) / 86400000
    );
  }

  function spanMonths(project) {
    return Math.round((dayDiff(project.start, project.due) / 30.44) * 10) / 10;
  }

  function clampISO(iso, minISO, maxISO) {
    if (iso < minISO) return minISO;
    if (iso > maxISO) return maxISO;
    return iso;
  }

  function riskLevel(risk) {
    if (risk >= 0.6) return "High";
    if (risk >= 0.4) return "Medium";
    return "Low";
  }

  function riskClass(level) {
    return level === "High"
      ? "risk-high"
      : level === "Medium"
        ? "risk-medium"
        : "risk-low";
  }

  function statusClass(status) {
    if (status === "Completed") return "status-completed";
    if (status === "Under review") return "status-review";
    if (status === "Not started") return "status-notstarted";
    return "status-progress";
  }

  function pct(value) {
    return Math.max(0, Math.min(100, Math.round(value))) + "%";
  }

  function locationLabel(project) {
    const l = project.location;
    return l.area + ", " + l.ward + ", " + l.city;
  }

  function relativeDay(iso) {
    const diff = dayDiff(iso, todayISO());
    if (diff === 0) return "today";
    if (diff === 1) return "yesterday";
    if (diff > 1) return diff + " days ago";
    if (diff === -1) return "tomorrow";
    return "in " + Math.abs(diff) + " days";
  }

  /* ---------------- state ---------------- */

  let projects = [];

  const state = {
    view: "overview",
    projectId: null,
    search: "",
    status: "all",
    category: "all",
    updates: load(KEYS.updates, SEED_UPDATES.slice()),
    reviews: load(KEYS.reviews, {}),
    projectFlags: load(KEYS.projectFlags, []),
    projectReviews: load(KEYS.projectReviews, []),
    issues: load(KEYS.issues, []),
    overrides: load(KEYS.overrides, {}),
    selectedDate: null,
    calMonth: null,
    draftPhotos: [],
    geo: { status: "idle" },
    geoPromise: null,
    lastFocus: null
  };

  function rebuildProjects() {
    projects = PROJECTS.map((project) => {
      const override = state.overrides[project.id];
      const progress = override ? override.progress : project.progress;
      const status =
        progress >= 100
          ? "Completed"
          : project.status === "Completed"
            ? "Completed"
            : project.status;
      return Object.assign({}, project, {
        progress,
        status,
        contractor: CONTRACTORS[project.contractorId],
        lastUpdateAt: override ? override.at : null
      });
    });
  }

  rebuildProjects();

  function scopedProjects() {
    if (isContractor) {
      return projects.filter(
        (project) => project.contractorId === session.contractorId
      );
    }
    return projects.slice();
  }

  function projectById(id) {
    return projects.find((project) => project.id === id) || null;
  }

  function updatesFor(projectId) {
    return state.updates
      .filter((update) => !projectId || update.projectId === projectId)
      .slice()
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }

  function contractorUpdates() {
    return updatesFor(null).filter((update) =>
      scopedProjects().some((project) => project.id === update.projectId)
    );
  }

  function openRiskProjects() {
    return projects
      .filter(
        (project) =>
          riskLevel(project.risk) === "High" &&
          state.projectReviews.indexOf(project.id) === -1
      )
      .sort((a, b) => b.risk - a.risk);
  }

  function watchProjects() {
    return projects
      .filter(
        (project) =>
          riskLevel(project.risk) !== "Low" &&
          state.projectReviews.indexOf(project.id) === -1
      )
      .sort((a, b) => b.risk - a.risk);
  }

  function pendingReviews() {
    return state.updates.filter((update) => !state.reviews[update.id]);
  }

  function myPendingCount() {
    const ids = scopedProjects().map((project) => project.id);
    return state.updates.filter(
      (update) => ids.indexOf(update.projectId) !== -1 && !state.reviews[update.id]
    ).length;
  }

  function isFlagged(projectId) {
    return state.projectFlags.indexOf(projectId) !== -1;
  }

  /* ---------------- dom ---------------- */

  const view = document.getElementById("view");
  const sideNav = document.getElementById("sideNav");
  const sidebar = document.getElementById("sidebar");
  const app = document.getElementById("app");
  const scrim = document.getElementById("scrim");
  const modalRoot = document.getElementById("modalRoot");
  const modal = document.getElementById("modal");
  const modalTitle = document.getElementById("modalTitle");
  const modalEyebrow = document.getElementById("modalEyebrow");
  const modalBody = document.getElementById("modalBody");
  const modalFoot = document.getElementById("modalFoot");
  const toastEl = document.getElementById("toast");
  const toastText = document.getElementById("toastText");

  const NAV = {
    citizen: [
      { id: "overview", label: "Overview", icon: "overview" },
      { id: "projects", label: "Public works", icon: "projects" },
      { id: "notices", label: "Notices", icon: "notices" }
    ],
    mp: [
      { id: "overview", label: "Command centre", icon: "overview" },
      { id: "projects", label: "All projects", icon: "projects" },
      { id: "alerts", label: "Risk flags", icon: "alerts", badge: () => openRiskProjects().length },
      { id: "updates", label: "Contractor updates", icon: "updates", badge: () => pendingReviews().length }
    ],
    contractor: [
      { id: "overview", label: "Overview", icon: "overview" },
      { id: "projects", label: "My works", icon: "projects" },
      { id: "updates", label: "My update log", icon: "updates" }
    ]
  };

  const VIEW_TITLES = {
    overview: { citizen: "Overview", mp: "Command centre", contractor: "Overview" },
    projects: { citizen: "Public works", mp: "All projects", contractor: "My works" },
    alerts: { mp: "Risk flags" },
    updates: { mp: "Contractor updates", contractor: "My update log" },
    notices: { citizen: "Notices" },
    detail: { citizen: "Work detail", mp: "Work detail", contractor: "Work detail" }
  };

  /* ---------------- shared fragments ---------------- */

  function meterHTML(progress, opts) {
    const options = opts || {};
    const tone =
      options.tone ||
      (progress >= 75 ? "" : progress >= 40 ? "meter-fill--info" : "meter-fill--warn");
    return (
      '<div class="meter">' +
      (options.hideLabel
        ? ""
        : '<div class="meter-row"><span>' +
          esc(options.label || "Progress") +
          "</span><strong>" +
          pct(progress) +
          "</strong></div>") +
      '<div class="meter-track"><span class="meter-fill ' +
      tone +
      '" style="width:' +
      pct(progress) +
      '"></span></div>' +
      "</div>"
    );
  }

  function statusPill(status) {
    return (
      '<span class="pill ' +
      statusClass(status) +
      '"><i></i>' +
      esc(status) +
      "</span>"
    );
  }

  function riskPill(project) {
    const level = riskLevel(project.risk);
    return (
      '<span class="pill ' +
      riskClass(level) +
      '"><i></i>' +
      level +
      " · " +
      project.risk.toFixed(2) +
      "</span>"
    );
  }

  function workCell(project, showContractor) {
    return (
      '<div class="cell-work"><strong>' +
      esc(project.name) +
      "</strong><span>" +
      esc(project.id) +
      " · " +
      esc(project.category) +
      (showContractor ? " · " + esc(project.contractor.name) : "") +
      "</span></div>"
    );
  }

  function kpiCard(kpi) {
    return (
      '<article class="kpi"><div class="kpi-top"><span class="kpi-label">' +
      esc(kpi.label) +
      '</span><span class="kpi-icon ' +
      (kpi.tone ? "kpi-icon--" + kpi.tone : "") +
      '">' +
      icon(kpi.icon) +
      '</span></div><span class="kpi-value">' +
      esc(kpi.value) +
      '</span><span class="kpi-foot">' +
      esc(kpi.foot) +
      "</span></article>"
    );
  }

  function barRow(label, value, display, tone) {
    return (
      '<div class="bar-row"><div class="bar-head"><strong>' +
      esc(label) +
      "</strong><span>" +
      esc(display) +
      '</span></div><div class="bar-track"><span class="bar-fill ' +
      (tone ? "bar-fill--" + tone : "") +
      '" style="width:' +
      pct(value) +
      '"></span></div></div>'
    );
  }

  function emptyState(title, body) {
    return (
      '<div class="empty">' +
      icon("layers") +
      "<strong>" +
      esc(title) +
      "</strong><p>" +
      esc(body) +
      "</p></div>"
    );
  }

  function greeting() {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  }

  /* ---------------- overview ---------------- */

  function heroHTML(list) {
    const dateLine =
      greeting() +
      ", " +
      session.shortName +
      " · " +
      new Date().toLocaleDateString("en-IN", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric"
      });

    if (isCitizen) {
      const avg = list.length
        ? list.reduce((sum, p) => sum + p.progress, 0) / list.length
        : 0;
      return (
        '<section class="hero hero--citizen"><div class="hero-copy">' +
        '<p class="eyebrow">' + esc(dateLine) + "</p>" +
        "<h2>Your constituency, in the open.</h2>" +
        "<p>Every MPLADS work sanctioned for this constituency, with its location, sanctioned cost and reported progress. You have read-only access — audit scores and administrative controls stay with the MP office.</p>" +
        '<div class="hero-actions">' +
        '<button class="btn btn-light" type="button" data-view="projects">' +
        icon("projects") +
        "Browse public works</button>" +
        '<button class="btn btn-outline-light" type="button" data-action="report">' +
        icon("flag") +
        "Report an issue</button>" +
        "</div></div>" +
        '<div class="gauge" style="--value:' +
        Math.round(avg) +
        ';--accent:#4c9d6b"><div class="gauge-inner"><strong>' +
        pct(avg) +
        "</strong><span>Avg. progress</span></div></div></section>"
      );
    }

    if (isMP) {
      const open = openRiskProjects().length;
      const sanctioned = list.reduce((sum, p) => sum + p.sanctioned, 0);
      const spent = list.reduce((sum, p) => sum + p.spent, 0);
      const utilised = sanctioned ? (spent / sanctioned) * 100 : 0;
      return (
        '<section class="hero"><div class="hero-copy">' +
        '<p class="eyebrow">' + esc(dateLine) + "</p>" +
        "<h2>" +
        (open
          ? open + " works need your attention."
          : "No open risk flags right now.") +
        "</h2>" +
        "<p>Full oversight of the constituency portfolio: sanction, utilisation, physical progress, contractor submissions and anomaly signals from the assessment engine.</p>" +
        '<div class="hero-actions">' +
        '<button class="btn btn-saffron" type="button" data-view="alerts">' +
        icon("alerts") +
        "Review risk flags</button>" +
        '<button class="btn btn-outline-light" type="button" data-view="updates">' +
        icon("updates") +
        pendingReviews().length +
        " updates pending</button>" +
        "</div></div>" +
        '<div class="gauge" style="--value:' +
        Math.round(utilised) +
        '"><div class="gauge-inner"><strong>' +
        pct(utilised) +
        "</strong><span>Funds utilised</span></div></div></section>"
      );
    }

    const myProgress = list.length
      ? list.reduce((sum, p) => sum + p.progress, 0) / list.length
      : 0;
    const next = nextDeadline(list);
    return (
      '<section class="hero hero--contractor"><div class="hero-copy">' +
      '<p class="eyebrow">' + esc(dateLine) + "</p>" +
      "<h2>" +
      list.length +
      " works awarded to " +
      esc(session.shortName) +
      ".</h2>" +
      "<p>Open a work to see its sanction, time span and awarding MP, then log a dated site update — progress, geotagged photos, materials used and time taken. Submissions go straight to the MP office.</p>" +
      '<div class="hero-actions">' +
      '<button class="btn btn-light" type="button" data-view="projects">' +
      icon("projects") +
      "My works</button>" +
      (next
        ? '<button class="btn btn-outline-light" type="button" data-action="open-project" data-id="' +
          esc(next.id) +
          '">' +
          icon("upload") +
          "Log an update</button>"
        : "") +
      "</div></div>" +
      '<div class="gauge" style="--value:' +
      Math.round(myProgress) +
      ';--accent:#5b8fd6"><div class="gauge-inner"><strong>' +
      pct(myProgress) +
      "</strong><span>Avg. progress</span></div></div></section>"
    );
  }

  function nextDeadline(list) {
    return (
      list
        .filter((project) => project.status !== "Completed")
        .sort((a, b) => (a.due < b.due ? -1 : 1))[0] || null
    );
  }

  function kpiHTML(list) {
    const sanctioned = list.reduce((sum, p) => sum + p.sanctioned, 0);
    const spent = list.reduce((sum, p) => sum + p.spent, 0);
    const avg = list.length
      ? Math.round(list.reduce((sum, p) => sum + p.progress, 0) / list.length)
      : 0;
    const completed = list.filter((p) => p.status === "Completed").length;

    if (isCitizen) {
      return (
        '<div class="kpi-grid">' +
        kpiCard({
          label: "Works in constituency",
          value: String(list.length),
          foot: "Across " + new Set(list.map((p) => p.category)).size + " sectors",
          icon: "layers",
          tone: "green"
        }) +
        kpiCard({
          label: "Funds sanctioned",
          value: moneyShort(sanctioned),
          foot: moneyShort(spent) + " reported as utilised",
          icon: "rupee"
        }) +
        kpiCard({
          label: "Average progress",
          value: pct(avg),
          foot: "As reported by executing agencies",
          icon: "chart",
          tone: "saffron"
        }) +
        kpiCard({
          label: "Completed",
          value: String(completed),
          foot: list.length - completed + " still running",
          icon: "check",
          tone: "green"
        }) +
        "</div>"
      );
    }

    if (isMP) {
      const open = openRiskProjects().length;
      return (
        '<div class="kpi-grid">' +
        kpiCard({
          label: "Portfolio",
          value: String(list.length) + " works",
          foot: moneyShort(sanctioned) + " sanctioned",
          icon: "layers"
        }) +
        kpiCard({
          label: "Funds utilised",
          value: moneyShort(spent),
          foot: pct(sanctioned ? (spent / sanctioned) * 100 : 0) + " of sanction",
          icon: "rupee",
          tone: "saffron"
        }) +
        kpiCard({
          label: "High-risk flags",
          value: String(open),
          foot: open ? "Awaiting your review" : "All clear",
          icon: "alerts",
          tone: "red"
        }) +
        kpiCard({
          label: "Pending submissions",
          value: String(pendingReviews().length),
          foot: "Contractor site updates to verify",
          icon: "updates",
          tone: "green"
        }) +
        "</div>"
      );
    }

    const inProgress = list.filter((p) => p.status === "In progress").length;
    return (
      '<div class="kpi-grid">' +
      kpiCard({
        label: "My works",
        value: String(list.length),
        foot: inProgress + " in progress",
        icon: "tools"
      }) +
      kpiCard({
        label: "Sanctioned value",
        value: moneyShort(sanctioned),
        foot: moneyShort(spent) + " billed so far",
        icon: "rupee",
        tone: "saffron"
      }) +
      kpiCard({
        label: "Average progress",
        value: pct(avg),
        foot: "From your logged site updates",
        icon: "chart",
        tone: "green"
      }) +
      kpiCard({
        label: "Updates logged",
        value: String(contractorUpdates().length),
        foot: myPendingCount() + " awaiting MP review",
        icon: "updates"
      }) +
      "</div>"
    );
  }

  function recentTable(list) {
    const rows = list.slice(0, 5);
    const title = isContractor ? "My works" : isMP ? "Portfolio" : "Public works";
    const showContractor = !isContractor;
    return (
      '<section class="panel"><div class="panel-head"><div>' +
      '<h3 class="panel-title">' +
      title +
      '</h3><p class="panel-sub">' +
      list.length +
      " works · sorted by sanction date</p></div>" +
      '<button class="link-btn" type="button" data-view="projects">View all</button></div>' +
      '<div class="panel-body panel-body--flush"><div class="table-wrap"><table>' +
      "<thead><tr><th scope=\"col\">Work</th><th scope=\"col\">Location</th>" +
      (isMP ? '<th scope="col">Risk</th>' : "") +
      '<th scope="col">Progress</th><th scope="col">Status</th>' +
      (isContractor ? '<th scope="col">Due</th>' : "") +
      '<th scope="col" aria-label="Actions"></th></tr></thead><tbody>' +
      rows
        .map((project) => {
          return (
            '<tr data-action="open-project" data-id="' +
            esc(project.id) +
            '" style="cursor:pointer">' +
            "<td>" +
            workCell(project, showContractor) +
            "</td>" +
            "<td>" +
            esc(locationLabel(project)) +
            "</td>" +
            (isMP ? "<td>" + riskPill(project) + "</td>" : "") +
            "<td>" +
            meterHTML(project.progress, { hideLabel: true }) +
            "</td>" +
            "<td>" +
            statusPill(project.status) +
            "</td>" +
            (isContractor
              ? '<td class="num">' + fmtDate(project.due) + "</td>"
              : "") +
            '<td class="cell-actions">' +
            (isContractor && project.status !== "Completed"
              ? '<button class="btn btn-primary btn-sm" type="button" data-action="open-project" data-id="' +
                esc(project.id) +
                '">' +
                icon("upload") +
                "Update</button>"
              : '<button class="btn btn-ghost btn-sm" type="button" data-action="open-project" data-id="' +
                esc(project.id) +
                '">' +
                icon("eye") +
                "View</button>") +
            "</td></tr>"
          );
        })
        .join("") +
      "</tbody></table></div></div></section>"
    );
  }

  function sidePanelHTML(list) {
    if (isCitizen) {
      const categories = categoryTotals(list).slice(0, 4);
      return (
        '<div class="stack">' +
        '<section class="panel"><div class="panel-head"><div><h3 class="panel-title">Notices</h3>' +
        '<p class="panel-sub">From the ward and MP office</p></div>' +
        '<button class="link-btn" type="button" data-view="notices">All notices</button></div>' +
        '<div class="panel-body panel-body--flush">' +
        NOTICES.slice(0, 2)
          .map((notice) => noticeHTML(notice))
          .join("") +
        "</div></section>" +
        '<section class="panel"><div class="panel-head"><div><h3 class="panel-title">Works by sector</h3>' +
        '<p class="panel-sub">Sanctioned value in this constituency</p></div></div>' +
        '<div class="panel-body"><div class="bar-list">' +
        (categories.length
          ? categories
              .map((row) =>
                barRow(
                  row.label,
                  (row.value / categories[0].value) * 100,
                  moneyShort(row.value)
                )
              )
              .join("")
          : emptyState("No works yet", "Sanctioned works will appear here.")) +
        "</div></div></section></div>"
      );
    }

    if (isMP) {
      const watch = watchProjects().slice(0, 3);
      const pending = pendingReviews().slice(0, 3);
      const levels = { High: 0, Medium: 0, Low: 0 };
      projects.forEach((project) => {
        levels[riskLevel(project.risk)] += 1;
      });
      return (
        '<div class="stack">' +
        '<section class="panel"><div class="panel-head"><div><h3 class="panel-title">Risk watchlist</h3>' +
        '<p class="panel-sub">Signals from the assessment engine</p></div>' +
        '<button class="link-btn" type="button" data-view="alerts">Open queue</button></div>' +
        '<div class="panel-body panel-body--flush">' +
        (watch.length
          ? watch
              .map(
                (project) =>
                  '<div class="mini-item"><span class="mini-icon ' +
                  (riskLevel(project.risk) === "High" ? "mini-icon--red" : "") +
                  '">' +
                  icon("alerts") +
                  '</span><div class="mini-text"><strong>' +
                  esc(project.name) +
                  "</strong><span>" +
                  esc(project.id) +
                  " · " +
                  esc(project.contractor.name) +
                  '</span><div class="mini-meta">' +
                  riskPill(project) +
                  (project.reasons[0]
                    ? "<span>" + esc(project.reasons[0]) + "</span>"
                    : "") +
                  "</div></div></div>"
              )
              .join("")
          : emptyState("No open signals", "Every work is currently within benchmark.")) +
        "</div></section>" +
        '<section class="panel"><div class="panel-head"><div><h3 class="panel-title">Risk spread</h3>' +
        '<p class="panel-sub">' +
        projects.length +
        " works assessed</p></div></div>" +
        '<div class="panel-body"><div class="bar-list">' +
        barRow("High", (levels.High / projects.length) * 100, levels.High + " works", "high") +
        barRow("Medium", (levels.Medium / projects.length) * 100, levels.Medium + " works", "medium") +
        barRow("Low", (levels.Low / projects.length) * 100, levels.Low + " works", "low") +
        "</div></div></section>" +
        '<section class="panel"><div class="panel-head"><div><h3 class="panel-title">Awaiting your review</h3>' +
        '<p class="panel-sub">' +
        pending.length +
        " contractor submissions</p></div>" +
        '<button class="link-btn" type="button" data-view="updates">Open</button></div>' +
        '<div class="panel-body panel-body--flush">' +
        (pending.length
          ? pending
              .map((update) => {
                const project = projectById(update.projectId);
                return (
                  '<div class="mini-item"><span class="mini-icon mini-icon--blue">' +
                  icon("camera") +
                  '</span><div class="mini-text"><strong>' +
                  esc(project ? project.name : update.projectId) +
                  "</strong><span>" +
                  pct(update.progress) +
                  " complete · logged " +
                  fmtDate(update.date) +
                  " by " +
                  esc(update.submittedBy) +
                  '</span></div></div>'
                );
              })
              .join("")
          : emptyState("Nothing pending", "All contractor submissions have been reviewed.")) +
        "</div></section></div>"
      );
    }

    const deadlines = list
      .filter((project) => project.status !== "Completed")
      .sort((a, b) => (a.due < b.due ? -1 : 1))
      .slice(0, 3);
    const myUpdates = contractorUpdates().slice(0, 3);
    return (
      '<div class="stack">' +
      '<section class="panel"><div class="panel-head"><div><h3 class="panel-title">Upcoming deadlines</h3>' +
      '<p class="panel-sub">Sanctioned time span per work</p></div></div>' +
      '<div class="panel-body panel-body--flush">' +
      (deadlines.length
        ? deadlines
            .map((project) => {
              const left = dayDiff(todayISO(), project.due);
              const tone = left < 0 ? "chip--danger" : left <= 30 ? "chip--warn" : "chip--good";
              return (
                '<div class="mini-item"><span class="mini-icon mini-icon--blue">' +
                icon("calendar") +
                '</span><div class="mini-text"><strong>' +
                esc(project.name) +
                "</strong><span>" +
                esc(project.id) +
                " · due " +
                fmtDate(project.due) +
                '</span><div class="mini-meta"><span class="chip ' +
                tone +
                '"><strong>' +
                (left < 0 ? Math.abs(left) + " days overdue" : left + " days left") +
                "</strong></span><span>" +
                pct(project.progress) +
                " reported</span></div></div></div>"
              );
            })
            .join("")
        : emptyState("No open deadlines", "All your works are completed.")) +
      "</div></section>" +
      '<section class="panel"><div class="panel-head"><div><h3 class="panel-title">Recent submissions</h3>' +
      '<p class="panel-sub">Visible to the MP office</p></div>' +
      '<button class="link-btn" type="button" data-view="updates">Full log</button></div>' +
      '<div class="panel-body panel-body--flush">' +
      (myUpdates.length
        ? myUpdates
            .map((update) => {
              const project = projectById(update.projectId);
              return (
                '<div class="mini-item"><span class="mini-icon mini-icon--green">' +
                icon("check") +
                '</span><div class="mini-text"><strong>' +
                esc(project ? project.name : update.projectId) +
                "</strong><span>" +
                pct(update.progress) +
                " · " +
                fmtDate(update.date) +
                " · " +
                update.photos.length +
                " photo" +
                (update.photos.length === 1 ? "" : "s") +
                '</span><div class="mini-meta">' +
                reviewPill(update.id) +
                "</div></div></div>"
              );
            })
            .join("")
        : emptyState("No updates yet", "Open a work and log your first dated site update.")) +
      "</div></section></div>"
    );
  }

  function categoryTotals(list) {
    const totals = new Map();
    list.forEach((project) => {
      totals.set(project.category, (totals.get(project.category) || 0) + project.sanctioned);
    });
    return Array.from(totals, ([label, value]) => ({ label, value })).sort(
      (a, b) => b.value - a.value
    );
  }

  function noticeHTML(notice) {
    const parts = notice.date.split(" ");
    return (
      '<article class="notice"><div class="notice-date"><strong>' +
      esc(parts[0]) +
      "</strong><span>" +
      esc(parts[1]) +
      '</span></div><div class="notice-body"><div class="mini-meta">' +
      '<span class="pill status-progress"><i></i>' +
      esc(notice.tag) +
      "</span><span>" +
      esc(notice.date) +
      "</span></div><h3>" +
      esc(notice.title) +
      "</h3><p>" +
      esc(notice.body) +
      "</p></div></article>"
    );
  }

  function reviewPill(updateId) {
    const review = state.reviews[updateId];
    if (!review) {
      return '<span class="pill status-notstarted"><i></i>Pending review</span>';
    }
    if (review.status === "approved") {
      return '<span class="pill status-completed"><i></i>Accepted by MP office</span>';
    }
    return '<span class="pill risk-high"><i></i>Flagged by MP office</span>';
  }

  function overviewHTML() {
    const list = scopedProjects();
    return heroHTML(list) + kpiHTML(list) + '<div class="split">' + recentTable(list) + sidePanelHTML(list) + "</div>";
  }

  /* ---------------- projects list ---------------- */

  function filteredProjects() {
    const query = state.search.trim().toLowerCase();
    return scopedProjects().filter((project) => {
      if (state.status !== "all" && project.status !== state.status) return false;
      if (state.category !== "all" && project.category !== state.category) return false;
      if (!query) return true;
      return (
        [
          project.name,
          project.id,
          project.category,
          project.location.area,
          project.location.ward,
          project.contractor.name
        ]
          .join(" ")
          .toLowerCase()
          .indexOf(query) !== -1
      );
    });
  }

  function projectsTableHTML() {
    const list = filteredProjects();
    if (!list.length) {
      return emptyState(
        "No works match these filters",
        "Try clearing the search box or choosing a different status."
      );
    }

    const head =
      "<thead><tr>" +
      '<th scope="col">Work</th>' +
      '<th scope="col">Location</th>' +
      '<th scope="col">Sanctioned</th>' +
      (isMP ? '<th scope="col">Utilisation</th><th scope="col">Risk</th>' : "") +
      '<th scope="col">Progress</th>' +
      '<th scope="col">Status</th>' +
      (isContractor ? '<th scope="col">Due</th>' : "") +
      '<th scope="col">Action</th>' +
      "</tr></thead>";

    const body =
      "<tbody>" +
      list
        .map((project) => {
          const utilisation = project.sanctioned
            ? (project.spent / project.sanctioned) * 100
            : 0;
          return (
            "<tr>" +
            "<td>" +
            workCell(project, !isContractor) +
            "</td>" +
            "<td>" +
            esc(locationLabel(project)) +
            "</td>" +
            '<td class="num" title="' +
            money(project.sanctioned) +
            '">' +
            moneyShort(project.sanctioned) +
            "</td>" +
            (isMP
              ? '<td class="num">' +
                pct(utilisation) +
                "</td><td>" +
                riskPill(project) +
                (isFlagged(project.id)
                  ? ' <span class="pill risk-medium"><i></i>Audit flag</span>'
                  : "") +
                "</td>"
              : "") +
            "<td>" +
            meterHTML(project.progress, { hideLabel: true }) +
            "</td>" +
            "<td>" +
            statusPill(project.status) +
            "</td>" +
            (isContractor
              ? '<td class="num">' + fmtDate(project.due) + "</td>"
              : "") +
            '<td class="cell-actions">' +
            (isContractor && project.status !== "Completed"
              ? '<button class="btn btn-primary btn-sm" type="button" data-action="open-project" data-id="' +
                esc(project.id) +
                '">' +
                icon("upload") +
                "Update</button>"
              : '<button class="btn btn-ghost btn-sm" type="button" data-action="open-project" data-id="' +
                esc(project.id) +
                '">' +
                icon("eye") +
                (isMP ? "Inspect" : "View") +
                "</button>") +
            "</td></tr>"
          );
        })
        .join("") +
      "</tbody>";

    return '<div class="table-wrap"><table>' + head + body + "</table></div>";
  }

  function projectsHTML() {
    const list = scopedProjects();
    const categories = Array.from(new Set(list.map((p) => p.category))).sort();
    const copy = isContractor
      ? "Works awarded to " +
        session.name +
        ". Open a work to see its sanction, time span and awarding MP, then log a dated site update."
      : isMP
        ? "Full constituency portfolio with utilisation, risk signals and administrative controls."
        : "Public record of MPLADS works in this constituency. Surface-level data only — audit scores are restricted.";

    const actions = isMP
      ? '<button class="btn btn-ghost" type="button" data-action="export-csv">' +
        icon("down") +
        "Export CSV</button>"
      : isCitizen
        ? '<button class="btn btn-ghost" type="button" data-action="report">' +
          icon("flag") +
          "Report an issue</button>"
        : "";

    return (
      '<div class="view-head"><div><h2>' +
      (isContractor ? "My works" : isMP ? "All projects" : "Public works") +
      "</h2><p>" +
      copy +
      '</p></div><div class="view-head-actions">' +
      actions +
      "</div></div>" +
      '<section class="panel"><div class="toolbar">' +
      '<label class="search">' +
      icon("search") +
      '<input id="projectSearch" type="search" placeholder="Search by name, ID, ward or contractor" value="' +
      esc(state.search) +
      '" aria-label="Search works"></label>' +
      '<select class="select" id="statusFilter" aria-label="Filter by status">' +
      ['all', "In progress", "Completed", "Under review", "Not started"]
        .map(
          (value) =>
            '<option value="' +
            value +
            '"' +
            (state.status === value ? " selected" : "") +
            ">" +
            (value === "all" ? "All statuses" : value) +
            "</option>"
        )
        .join("") +
      "</select>" +
      '<select class="select" id="categoryFilter" aria-label="Filter by sector">' +
      '<option value="all"' +
      (state.category === "all" ? " selected" : "") +
      ">All sectors</option>" +
      categories
        .map(
          (value) =>
            '<option value="' +
            esc(value) +
            '"' +
            (state.category === value ? " selected" : "") +
            ">" +
            esc(value) +
            "</option>"
        )
        .join("") +
      "</select>" +
      '<span class="toolbar-count" id="tableCount">' +
      filteredProjects().length +
      " of " +
      list.length +
      " works</span></div>" +
      '<div id="tableHost">' +
      projectsTableHTML() +
      "</div></section>"
    );
  }

  /* ---------------- project detail ---------------- */

  function factsHTML(project) {
    const utilisation = project.sanctioned
      ? (project.spent / project.sanctioned) * 100
      : 0;
    const facts = [
      {
        label: "Total sanctioned",
        icon: "rupee",
        value: moneyShort(project.sanctioned),
        valueClass: "fact-value--money",
        note: money(project.sanctioned) + " sanctioned under MPLADS"
      },
      {
        label: "Time span",
        icon: "calendar",
        value: trimNum(spanMonths(project)) + " months",
        note: fmtDate(project.start) + " → " + fmtDate(project.due)
      },
      {
        label: "Under which MP",
        icon: "user",
        value: project.mp.name,
        note: "Constituency: " + project.mp.constituency
      },
      {
        label: "Location",
        icon: "pin",
        value: project.location.area + ", " + project.location.ward,
        note:
          project.location.city +
          (isContractor || isMP
            ? " · " +
              project.location.lat.toFixed(4) +
              "° N, " +
              project.location.lng.toFixed(4) +
              "° E"
            : "")
      }
    ];

    if (isMP) {
      facts.push({
        label: "Utilisation",
        icon: "chart",
        value: pct(utilisation),
        note: moneyShort(project.spent) + " of " + moneyShort(project.sanctioned) + " spent"
      });
      facts.push({
        label: "Executing authority",
        icon: "building",
        value: project.authority,
        note: "Work order " + project.workOrder
      });
      facts.push({
        label: "Contractor",
        icon: "tools",
        value: project.contractor.name,
        note:
          project.contractor.class +
          " · " +
          project.contractor.phone +
          " · " +
          project.contractor.contact
      });
    } else if (isContractor) {
      facts.push({
        label: "Your firm",
        icon: "tools",
        value: project.contractor.name,
        note: project.contractor.class + " · registered " + project.contractor.since
      });
      facts.push({
        label: "Work order",
        icon: "doc",
        value: project.workOrder,
        note: "Issued by " + project.authority
      });
    } else {
      facts.push({
        label: "Executing agency",
        icon: "building",
        value: project.authority,
        note: "Work order " + project.workOrder
      });
      facts.push({
        label: "Contractor",
        icon: "tools",
        value: project.contractor.name,
        note: project.contractor.class
      });
    }

    return (
      '<div class="fact-grid">' +
      facts
        .map(
          (fact) =>
            '<div class="fact"><span class="fact-label">' +
            icon(fact.icon) +
            esc(fact.label) +
            '</span><span class="fact-value ' +
            (fact.valueClass || "") +
            '">' +
            esc(fact.value) +
            '</span><span class="fact-note">' +
            esc(fact.note) +
            "</span></div>"
        )
        .join("") +
      "</div>"
    );
  }

  function spanHTML(project) {
    const today = todayISO();
    const total = dayDiff(project.start, project.due);
    const elapsed = Math.max(
      0,
      Math.min(100, Math.round((dayDiff(project.start, today) / total) * 100))
    );
    const left = dayDiff(today, project.due);
    const gap = project.progress - elapsed;

    let insight = "";
    if (gap < -10) {
      insight =
        '<div class="banner banner--warn">' +
        icon("clock") +
        "<div><strong>Reported progress is " +
        Math.abs(gap) +
        " points behind the elapsed time span.</strong>" +
        "Time elapsed: " +
        pct(elapsed) +
        " · work reported: " +
        pct(project.progress) +
        ".</div></div>";
    } else if (gap > 10) {
      insight =
        '<div class="banner banner--info">' +
        icon("info") +
        "<div><strong>Reported progress runs ahead of the time span.</strong>" +
        "Verify physical completion against the billed amount before release.</div></div>";
    } else {
      insight =
        '<div class="banner banner--good">' +
        icon("check") +
        "<div><strong>Progress is broadly in line with the sanctioned time span.</strong>" +
        "Time elapsed: " +
        pct(elapsed) +
        " · work reported: " +
        pct(project.progress) +
        ".</div></div>";
    }

    return (
      '<div class="span-panel">' +
      '<div class="span-head"><div class="span-window"><strong>' +
      fmtDate(project.start) +
      " &nbsp;→&nbsp; " +
      fmtDate(project.due) +
      "</strong><span>Sanctioned time span · " +
      trimNum(spanMonths(project)) +
      " months (" +
      total +
      " days)</span></div>" +
      '<div class="span-chips">' +
      '<span class="chip ' +
      (left < 0 ? "chip--danger" : left <= 30 ? "chip--warn" : "chip--good") +
      '">' +
      icon("clock") +
      "<strong>" +
      (left < 0
        ? Math.abs(left) + " days overdue"
        : left + " days remaining") +
      "</strong></span>" +
      '<span class="chip">' +
      icon("updates") +
      "<strong>" +
      updatesFor(project.id).length +
      "</strong> site updates</span>" +
      "</div></div>" +
      '<div class="span-bars">' +
      meterHTML(elapsed, { label: "Time span elapsed", tone: "meter-fill--info" }) +
      meterHTML(project.progress, { label: "Work reported" }) +
      "</div>" +
      insight +
      "</div>"
    );
  }

  function calendarHTML(project) {
    const start = project.start;
    const today = todayISO();
    const maxLoggable = project.due < today ? project.due : today;
    const minMonth = monthStartISO(start);
    const maxMonth = monthStartISO(isContractor ? maxLoggable : project.due);
    const monthISO = clampISO(state.calMonth || monthStartISO(state.selectedDate || today), minMonth, maxMonth);
    state.calMonth = monthISO;

    const first = parseISO(monthISO);
    const year = first.getFullYear();
    const monthIndex = first.getMonth();
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const leading = (first.getDay() + 6) % 7;
    const monthLabel = first.toLocaleDateString("en-IN", {
      month: "long",
      year: "numeric"
    });

    const updateDates = new Set(updatesFor(project.id).map((update) => update.date));
    const cells = [];

    for (let i = 0; i < leading; i += 1) {
      cells.push('<span class="cal-day" aria-hidden="true"></span>');
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const iso = isoOf(new Date(year, monthIndex, day));
      const inSpan = iso >= start && iso <= project.due;
      const hasUpdate = updateDates.has(iso);
      const clickable = isContractor
        ? inSpan && iso <= maxLoggable
        : inSpan && hasUpdate;
      const classes = ["cal-day"];
      if (inSpan) classes.push("is-inspan");
      if (iso === today) classes.push("is-today");
      if (isContractor && iso === state.selectedDate) classes.push("is-selected");

      const attrs = clickable
        ? isContractor
          ? ' data-action="pick-date" data-date="' + iso + '"'
          : ' data-action="open-day" data-date="' +
            iso +
            '" data-id="' +
            esc(project.id) +
            '"'
        : " disabled";

      cells.push(
        '<button type="button" class="' +
          classes.join(" ") +
          '"' +
          attrs +
          ' aria-label="' +
          fmtDate(iso) +
          (hasUpdate ? " — site update logged" : "") +
          '"' +
          (isContractor && iso === state.selectedDate ? ' aria-pressed="true"' : "") +
          ">" +
          day +
          (hasUpdate ? '<span class="cal-dot"></span>' : "") +
          "</button>"
      );
    }

    const dows = ["M", "T", "W", "T", "F", "S", "S"]
      .map((dow) => '<span class="cal-dow">' + dow + "</span>")
      .join("");

    return (
      '<div class="cal-head"><span class="cal-month">' +
      esc(monthLabel) +
      '</span><span class="cal-nav">' +
      '<button class="icon-btn" type="button" data-action="cal-prev" aria-label="Previous month"' +
      (monthISO <= minMonth ? " disabled" : "") +
      ">" +
      icon("chevronLeft") +
      "</button>" +
      '<button class="icon-btn" type="button" data-action="cal-next" aria-label="Next month"' +
      (monthISO >= maxMonth ? " disabled" : "") +
      ">" +
      icon("chevronRight") +
      "</button></span></div>" +
      '<div class="cal-grid">' +
      dows +
      cells.join("") +
      "</div>" +
      '<div class="cal-legend">' +
      '<span><i class="legend-key legend-key--span"></i>Within sanctioned span</span>' +
      '<span><i class="legend-key legend-key--today"></i>Today</span>' +
      '<span><i class="legend-key legend-key--update"></i>Site update logged</span>' +
      (isContractor
        ? "<span>Updates can only be logged inside the awarded time span, up to today.</span>"
        : "<span>Select a marked day to open that day's submission.</span>") +
      "</div>"
    );
  }

  function materialRowHTML(item) {
    const value = item || { name: "", qty: "", unit: UNITS[0] };
    return (
      '<div class="material-row">' +
      '<input class="input" data-field="name" list="materialOptions" type="text" placeholder="Material used" value="' +
      esc(value.name) +
      '" aria-label="Material name">' +
      '<input class="input" data-field="qty" type="number" min="0" step="0.5" placeholder="Qty" value="' +
      esc(value.qty) +
      '" aria-label="Quantity">' +
      '<select class="select" data-field="unit" aria-label="Unit">' +
      UNITS.map(
        (unit) =>
          '<option value="' +
          unit +
          '"' +
          (unit === value.unit ? " selected" : "") +
          ">" +
          unit +
          "</option>"
      ).join("") +
      "</select>" +
      '<button class="material-remove" type="button" data-action="remove-material" aria-label="Remove material row">' +
      icon("trash") +
      "</button></div>"
    );
  }
  function uploadFormHTML(project) {
    const maxLoggable = project.due < todayISO() ? project.due : todayISO();
    return (
      '<section class="panel" id="uploadPanel"><div class="panel-head"><div>' +
      '<h3 class="panel-title">Log a site update</h3>' +
      '<p class="panel-sub">Pick a date on the calendar, then upload the work details</p></div>' +
      '<span class="pill status-progress"><i></i>' +
      esc(session.name) +
      "</span></div>" +
      '<div class="panel-body"><form class="form-stack" id="updateForm" novalidate>' +
      '<datalist id="materialOptions">' +
      MATERIALS.map((material) => '<option value="' + esc(material) + '"></option>').join("") +
      "</datalist>" +
      '<div class="form-section"><span class="form-section-title">' +
      icon("calendar") +
      "Update date</span>" +
      '<div class="date-row' +
      (state.selectedDate ? "" : " is-empty") +
      '" id="draftDateRow">' +
      icon("calendar") +
      '<div><strong id="draftDateText">' +
      (state.selectedDate ? fmtDate(state.selectedDate) : "No date selected") +
      "</strong><span id=\"draftDateSub\">" +
      (state.selectedDate
        ? relativeDay(state.selectedDate) +
          " · within span " +
          fmtDate(project.start) +
          " – " +
          fmtDate(maxLoggable)
        : "Select a day inside the sanctioned time span to log work done on that date.") +
      '</span></div></div>' +
      '<p class="form-error" id="dateError"></p></div>' +
      '<div class="form-section"><span class="form-section-title">' +
      icon("chart") +
      "Work completed</span>" +
      '<div class="range-row">' +
      '<input id="draftProgress" type="range" min="0" max="100" step="1" value="' +
      project.progress +
      '" aria-label="Percentage of work completed">' +
      '<span class="range-value"><strong id="progressValue">' +
      project.progress +
      "%</strong><span>completed</span></span></div>" +
      '<p class="field-hint">Currently on record: ' +
      pct(project.progress) +
      ". Your submission updates the figure the MP office sees.</p></div>" +
      '<div class="form-section"><span class="form-section-title">' +
      icon("clock") +
      "Time taken</span>" +
      '<div class="form-grid-2">' +
      '<div><label class="field-label" for="draftTimeValue">Duration covered</label>' +
      '<input class="input" id="draftTimeValue" type="number" min="0.5" step="0.5" value="7" aria-label="Duration"></div>' +
      '<div><label class="field-label" for="draftTimeUnit">Unit</label>' +
      '<select class="select" id="draftTimeUnit" style="width:100%;height:38px">' +
      ["days", "weeks", "hours"]
        .map((unit) => '<option value="' + unit + '">' + unit + "</option>")
        .join("") +
      "</select></div></div>" +
      '<p class="field-hint">How long the reported work took on site.</p></div>' +
      '<div class="form-section"><span class="form-section-title">' +
      icon("box") +
      "Raw materials used</span>" +
      '<div id="materialsHost">' +
      materialRowHTML({ name: "", qty: "", unit: UNITS[0] }) +
      "</div>" +
      '<button class="btn btn-ghost btn-sm" type="button" id="addMaterialBtn" style="align-self:flex-start">' +
      icon("plus") +
      "Add material</button>" +
      '<p class="form-error" id="materialError"></p></div>' +
      '<div class="form-section"><span class="form-section-title">' +
      icon("camera") +
      "Geotagged site photos</span>" +
      '<div class="photo-drop" id="photoDrop" role="button" tabindex="0">' +
      '<span class="photo-drop-icon">' +
      icon("upload") +
      '</span><span class="photo-drop-text"><strong>Upload site photos</strong>' +
      "<span>JPG or PNG · up to 3 photos · location is attached to each photo</span></span>" +
      '<input id="photoInput" type="file" accept="image/*" multiple hidden></div>' +
      '<div class="geo-row" id="geoRow">' +
      icon("pin") +
      '<span id="geoStatus">Location not captured yet.</span>' +
      '<input class="input" id="geoLat" type="text" inputmode="decimal" placeholder="Latitude" aria-label="Latitude" value="' +
      project.location.lat.toFixed(5) +
      '">' +
      '<input class="input" id="geoLng" type="text" inputmode="decimal" placeholder="Longitude" aria-label="Longitude" value="' +
      project.location.lng.toFixed(5) +
      '"></div>' +
      '<div class="photo-grid" id="photoGrid"></div>' +
      '<p class="form-error" id="photoError"></p></div>' +
      '<div class="form-section"><span class="form-section-title">' +
      icon("doc") +
      "Site note</span>" +
      '<textarea class="textarea" id="draftNote" placeholder="What was completed on this date, any blockers, next steps…" aria-label="Site note"></textarea></div>' +
      '<p class="form-error" id="draftError"></p>' +
      '<div class="hero-actions">' +
      '<button class="btn btn-primary" type="submit" id="submitUpdate">' +
      icon("upload") +
      "Submit update to MP office</button>" +
      '<button class="btn btn-ghost" type="button" id="clearDraft">Clear</button>' +
      "</div></form></div></section>"
    );
  }

  function mpControlHTML(project) {
    const level = riskLevel(project.risk);
    const flagged = isFlagged(project.id);
    const reviewed = state.projectReviews.indexOf(project.id) !== -1;
    return (
      '<section class="panel"><div class="panel-head"><div>' +
      '<h3 class="panel-title">Oversight &amp; control</h3>' +
      '<p class="panel-sub">Administrative actions on this work</p></div>' +
      '<span class="pill ' +
      riskClass(level) +
      '"><i></i>' +
      level +
      " risk</span></div>" +
      '<div class="panel-body form-stack">' +
      (project.reasons.length
        ? '<div class="form-section"><span class="form-section-title">' +
          icon("alerts") +
          "Assessment signals</span><ul class=\"reason-list\">" +
          project.reasons
            .map((reason) => "<li>" + esc(reason) + "</li>")
            .join("") +
          "</ul></div>"
        : '<div class="banner banner--good">' +
          icon("check") +
          "<div><strong>No anomaly signals.</strong>Cost, tender and progress checks are within benchmark.</div></div>") +
      (flagged
        ? '<div class="banner banner--danger">' +
          icon("flag") +
          "<div><strong>Flagged for audit.</strong>The contractor sees this flag on their copy of the work.</div></div>"
        : "") +
      (reviewed
        ? '<div class="banner banner--info">' +
          icon("check") +
          "<div><strong>Marked as reviewed.</strong>This work no longer appears in the risk queue.</div></div>"
        : "") +
      '<div class="form-section"><span class="form-section-title">' +
      icon("shield") +
      "Actions</span>" +
      '<div class="alert-actions">' +
      '<button class="btn ' +
      (flagged ? "btn-ghost" : "btn-primary") +
      '" type="button" data-action="toggle-flag" data-id="' +
      esc(project.id) +
      '">' +
      icon("flag") +
      (flagged ? "Remove audit flag" : "Flag for audit") +
      "</button>" +
      '<button class="btn btn-ghost" type="button" data-action="review-project" data-id="' +
      esc(project.id) +
      '">' +
      icon("check") +
      (reviewed ? "Reopen in risk queue" : "Mark reviewed") +
      "</button>" +
      '<button class="btn btn-ghost" type="button" data-action="request-info" data-id="' +
      esc(project.id) +
      '">' +
      icon("doc") +
      "Request clarification</button>" +
      "</div></div></div></section>"
    );
  }

  function citizenPanelHTML(project) {
    return (
      '<section class="panel"><div class="panel-head"><div>' +
      '<h3 class="panel-title">What you can see</h3>' +
      '<p class="panel-sub">Public information for this work</p></div></div>' +
      '<div class="panel-body form-stack">' +
      '<ul class="bullet-list">' +
      [
        "Sanctioned cost, location and awarding MP",
        "Sanctioned time span and reported physical progress",
        "Executing authority, contractor and work order reference"
      ]
        .map((item) => "<li>" + icon("check") + "<span>" + item + "</span></li>")
        .join("") +
      "</ul>" +
      '<div class="banner banner--info">' +
      icon("info") +
      "<div><strong>Restricted for public view.</strong>Anomaly scores, audit notes, contractor contact details and bill-level data are visible only to the MP office and authorities.</div></div>" +
      '<div class="alert-actions">' +
      '<button class="btn btn-primary" type="button" data-action="report" data-id="' +
      esc(project.id) +
      '">' +
      icon("flag") +
      "Report an issue</button>" +
      '<button class="btn btn-ghost" type="button" data-view="notices">' +
      icon("notices") +
      "Public notices</button>" +
      "</div></div></section>"
    );
  }

  function updateLogHTML(updates, options) {
    const opts = options || {};
    if (!updates.length) {
      return emptyState(
        opts.emptyTitle || "No site updates yet",
        opts.emptyBody ||
          "Updates logged by the contractor will appear here with progress, photos and materials."
      );
    }

    return (
      '<div class="log-list">' +
      updates
        .map((update) => {
          const project = projectById(update.projectId);
          const parts = parseISO(update.date)
            .toLocaleDateString("en-IN", { day: "numeric", month: "short" })
            .split(" ");
          const review = state.reviews[update.id];
          return (
            '<article class="log-item"><div class="log-rail">' +
            '<div class="log-date"><strong>' +
            esc(parts[0]) +
            "</strong><span>" +
            esc(parts[1]) +
            '</span></div><div class="log-rail-line"></div></div>' +
            '<div class="log-body">' +
            '<div class="log-head"><div><h3>' +
            (opts.showProject && project ? esc(project.name) : "Site update logged") +
            "</h3><span>" +
            esc(update.projectId) +
            " · by " +
            esc(update.submittedBy) +
            " · submitted " +
            fmtDateTime(update.submittedAt) +
            '</span></div><div class="log-stats">' +
            '<span class="pill status-progress"><i></i>' +
            pct(update.progress) +
            " complete</span>" +
            '<span class="pill status-notstarted"><i></i>' +
            trimNum(update.timeValue) +
            " " +
            esc(update.timeUnit) +
            " on site</span>" +
            (update.photos.length
              ? '<span class="pill status-completed"><i></i>' +
                update.photos.length +
                " geotagged photo" +
                (update.photos.length === 1 ? "" : "s") +
                "</span>"
              : "") +
            reviewPill(update.id) +
            "</div></div>" +
            (update.note ? '<p class="log-note">' + esc(update.note) + "</p>" : "") +
            (update.materials.length
              ? '<div class="log-materials">' +
                update.materials
                  .map(
                    (material) =>
                      '<span class="material-tag">' +
                      icon("box") +
                      esc(material.name) +
                      " · <strong>" +
                      trimNum(material.qty) +
                      " " +
                      esc(material.unit) +
                      "</strong></span>"
                  )
                  .join("") +
                "</div>"
              : "") +
            (update.photos.length
              ? '<div class="photo-thumbs">' +
                update.photos
                  .map(
                    (photo, index) =>
                      '<div class="photo-thumb"><img src="' +
                      photo.dataUrl +
                      '" alt="Site photo for ' +
                      esc(update.projectId) +
                      ' on ' +
                      fmtDate(update.date) +
                      '">' +
                      '<span class="photo-thumb-geo">' +
                      icon("pin") +
                      photo.lat.toFixed(4) +
                      ", " +
                      photo.lng.toFixed(4) +
                      "</span>" +
                      '<button type="button" data-action="view-photo" data-update="' +
                      esc(update.id) +
                      '" data-photo="' +
                      index +
                      '" aria-label="Enlarge site photo"></button></div>'
                  )
                  .join("") +
                "</div>"
              : '<p class="field-hint">No photo attached to this entry.</p>') +
            (review && review.note
              ? '<div class="banner ' +
                (review.status === "approved" ? "banner--good" : "banner--danger") +
                '">' +
                icon(review.status === "approved" ? "check" : "flag") +
                "<div><strong>MP office note</strong>" +
                esc(review.note) +
                "</div></div>"
              : "") +
            (isMP
              ? '<div class="review-strip">' +
                (review
                  ? '<span class="field-hint">Reviewed ' +
                    fmtDateTime(review.at) +
                    "</span>"
                  : "") +
                '<button class="btn btn-ghost btn-sm" type="button" data-action="review-update" data-id="' +
                esc(update.id) +
                '" data-status="approved">' +
                icon("check") +
                "Accept submission</button>" +
                '<button class="btn btn-ghost btn-sm" type="button" data-action="review-update" data-id="' +
                esc(update.id) +
                '" data-status="flagged">' +
                icon("flag") +
                "Flag for audit</button>" +
                "</div>"
              : "") +
            "</div></article>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  function detailHTML(project) {
    const flagged = isFlagged(project.id);
    const flaggedUpdates = updatesFor(project.id).filter(
      (update) => state.reviews[update.id] && state.reviews[update.id].status === "flagged"
    );

    let banner = "";
    if (isContractor && flagged) {
      banner =
        '<div class="banner banner--danger">' +
        icon("flag") +
        "<div><strong>This work has been flagged for audit by the MP office.</strong>" +
        "Keep logging dated site updates with geotagged photos and material records — they form your evidence trail.</div></div>";
    } else if (isContractor && flaggedUpdates.length) {
      banner =
        '<div class="banner banner--warn">' +
        icon("alerts") +
        "<div><strong>" +
        flaggedUpdates.length +
        " of your submissions were flagged.</strong>Open your update log to read the MP office note.</div></div>";
    } else if (isContractor && project.status === "Completed") {
      banner =
        '<div class="banner banner--good">' +
        icon("check") +
        "<div><strong>This work is recorded as completed.</strong>Further site updates are closed.</div></div>";
    }

    const sidePanel = isContractor
      ? project.status === "Completed"
        ? '<section class="panel"><div class="panel-head"><div>' +
          '<h3 class="panel-title">Site updates</h3>' +
          '<p class="panel-sub">This work is closed for further updates</p></div></div>' +
          '<div class="panel-body"><div class="banner banner--good">' +
          icon("check") +
          "<div><strong>Handover recorded.</strong>The final submission below is the closing entry for this work.</div></div></div></section>"
        : uploadFormHTML(project)
      : isMP
        ? mpControlHTML(project)
        : citizenPanelHTML(project);

    const logOpts = { showProject: false };

    return (
      '<section class="detail">' +
      '<button class="detail-back" type="button" data-view="projects">' +
      icon("back") +
      "Back to " +
      (isContractor ? "my works" : isMP ? "all projects" : "public works") +
      "</button>" +
      '<header class="detail-head"><div><h2>' +
      esc(project.name) +
      '</h2><div class="detail-meta">' +
      '<span class="pill status-notstarted">' +
      esc(project.id) +
      "</span>" +
      '<span class="pill status-notstarted"><i></i>' +
      esc(project.category) +
      "</span>" +
      statusPill(project.status) +
      (isMP ? riskPill(project) : "") +
      "<span>" +
      icon("pin") +
      " " +
      esc(locationLabel(project)) +
      "</span></div></div>" +
      '<div class="detail-head-actions">' +
      (isMP
        ? '<button class="btn btn-ghost" type="button" data-action="export-csv" data-id="' +
          esc(project.id) +
          '">' +
          icon("down") +
          "Export</button>"
        : "") +
      (isContractor && project.status !== "Completed"
        ? '<button class="btn btn-primary" type="button" data-action="focus-form">' +
          icon("upload") +
          "Log site update</button>"
        : "") +
      "</div></header>" +
      banner +
      '<section class="panel"><div class="panel-head"><div>' +
      '<h3 class="panel-title">Sanction &amp; award</h3>' +
      '<p class="panel-sub">' +
      esc(project.description) +
      '</p></div></div>' +
      factsHTML(project) +
      "</section>" +
      '<section class="panel"><div class="panel-head"><div>' +
      '<h3 class="panel-title">Time span vs work reported</h3>' +
      '<p class="panel-sub">Awarded window set by the authority</p></div></div>' +
      '<div class="panel-body">' +
      spanHTML(project) +
      "</div></section>" +
      '<div class="calendar-grid">' +
      '<section class="panel"><div class="panel-head"><div>' +
      '<h3 class="panel-title">' +
      (isContractor ? "Pick the date you worked" : "Submission calendar") +
      "</h3><p class=\"panel-sub\">" +
      (isContractor
        ? "Only days inside the sanctioned time span can be selected"
        : "Days marked with a dot have a contractor submission") +
      '</p></div></div><div class="panel-body"><div id="calendarHost">' +
      calendarHTML(project) +
      "</div></div></section>" +
      '<div class="stack">' +
      sidePanel +
      "</div></div>" +
      '<section class="panel"><div class="panel-head"><div>' +
      '<h3 class="panel-title">' +
      (isContractor ? "My submissions on this work" : "Site update log") +
      "</h3><p class=\"panel-sub\">" +
      updatesFor(project.id).length +
      " entries · visible to the MP office" +
      (isContractor ? " and authorities" : "") +
      '</p></div></div><div id="logHost">' +
      updateLogHTML(updatesFor(project.id), logOpts) +
      "</div></section>" +
      "</section>"
    );
  }

  /* ---------------- role views ---------------- */

  function alertsHTML() {
    const watch = watchProjects();
    const issues = state.issues;
    return (
      '<div class="view-head"><div><h2>Risk flags</h2>' +
      "<p>Anomaly signals from the assessment engine: cost benchmarking, tender review, duplicate detection and progress-vs-billing gaps. Signals are advisory — verify on site before administrative action.</p></div>" +
      '<div class="view-head-actions"><button class="btn btn-ghost" type="button" data-action="export-csv">' +
      icon("down") +
      "Export CSV</button></div></div>" +
      '<section class="panel"><div class="panel-head"><div><h3 class="panel-title">Open queue</h3>' +
      '<p class="panel-sub">' +
      watch.length +
      " works above threshold</p></div></div>" +
      (watch.length
        ? watch
            .map((project) => {
              const level = riskLevel(project.risk);
              return (
                '<article class="alert-card"><span class="alert-bar ' +
                (level === "Medium" ? "alert-bar--medium" : "") +
                '"></span><div class="alert-main">' +
                '<div class="alert-head"><div><h3>' +
                esc(project.name) +
                "</h3><span>" +
                esc(project.id) +
                " · " +
                esc(locationLabel(project)) +
                " · " +
                esc(project.contractor.name) +
                "</span></div>" +
                riskPill(project) +
                "</div>" +
                '<div class="log-stats">' +
                '<span class="chip">' +
                icon("rupee") +
                "<strong>" +
                moneyShort(project.sanctioned) +
                "</strong> sanctioned</span>" +
                '<span class="chip">' +
                icon("chart") +
                "<strong>" +
                pct((project.spent / project.sanctioned) * 100) +
                "</strong> utilised</span>" +
                '<span class="chip">' +
                icon("clock") +
                "<strong>" +
                pct(project.progress) +
                "</strong> reported</span>" +
                statusPill(project.status) +
                "</div>" +
                (project.reasons.length
                  ? '<ul class="reason-list">' +
                    project.reasons
                      .map((reason) => "<li>" + esc(reason) + "</li>")
                      .join("") +
                    "</ul>"
                  : "") +
                '<div class="alert-actions">' +
                '<button class="btn btn-primary btn-sm" type="button" data-action="open-project" data-id="' +
                esc(project.id) +
                '">' +
                icon("eye") +
                "Inspect work</button>" +
                '<button class="btn btn-ghost btn-sm" type="button" data-action="toggle-flag" data-id="' +
                esc(project.id) +
                '">' +
                icon("flag") +
                (isFlagged(project.id) ? "Remove audit flag" : "Flag for audit") +
                "</button>" +
                '<button class="btn btn-ghost btn-sm" type="button" data-action="review-project" data-id="' +
                esc(project.id) +
                '">' +
                icon("check") +
                "Mark reviewed</button>" +
                "</div></div></article>"
              );
            })
            .join("")
        : emptyState("Queue clear", "No works are above the risk threshold right now.")) +
      "</section>" +
      '<section class="panel"><div class="panel-head"><div><h3 class="panel-title">Citizen reports</h3>' +
      '<p class="panel-sub">Issues raised from the public view</p></div></div>' +
      (issues.length
        ? issues
            .slice()
            .reverse()
            .map((issue) => {
              const project = projectById(issue.projectId);
              return (
                '<div class="mini-item"><span class="mini-icon mini-icon--red">' +
                icon("flag") +
                '</span><div class="mini-text"><strong>' +
                esc(project ? project.name : "General") +
                "</strong><p>" +
                esc(issue.note) +
                "</p><div class=\"mini-meta\"><span>" +
                esc(issue.by) +
                "</span><span>" +
                fmtDateTime(issue.at) +
                "</span>" +
                (issue.projectId
                  ? '<button class="link-btn" type="button" data-action="open-project" data-id="' +
                    esc(issue.projectId) +
                    '">Open work</button>'
                  : "") +
                "</div></div></div>"
              );
            })
            .join("")
        : emptyState("No reports", "Citizens have not raised an issue on this constituency.")) +
      "</section>"
    );
  }

  function updatesViewHTML() {
    const updates = isMP ? updatesFor(null) : contractorUpdates();
    const copy = isMP
      ? "Every dated submission from contractors, with geotagged photos, materials and time on site. Accept or flag each entry."
      : "Your submissions across all awarded works, with the MP office response on each entry.";
    return (
      '<div class="view-head"><div><h2>' +
      (isMP ? "Contractor updates" : "My update log") +
      "</h2><p>" +
      copy +
      "</p></div></div>" +
      '<section class="panel">' +
      (updates.length
        ? updateLogHTML(updates, { showProject: true })
        : emptyState(
            isMP ? "No submissions yet" : "No updates logged yet",
            isMP
              ? "Contractor site updates will appear here as they are filed."
              : "Open one of your works and log the first dated update."
          )) +
      "</section>"
    );
  }

  function noticesHTML() {
    return (
      '<div class="view-head"><div><h2>Notices</h2>' +
      "<p>Public notices from the MP office, ward office and executing authorities.</p></div></div>" +
      '<section class="panel"><div class="panel-body panel-body--flush">' +
      NOTICES.map((notice) => noticeHTML(notice)).join("") +
      "</div></section>" +
      '<div class="split"><section class="panel"><div class="panel-head"><div>' +
      '<h3 class="panel-title">What citizen access includes</h3>' +
      '<p class="panel-sub">Surface-level public data</p></div></div>' +
      '<div class="panel-body"><ul class="bullet-list">' +
      [
        "Works sanctioned in your constituency, with location and sector",
        "Sanctioned cost and reported physical progress",
        "Sanctioned time span, executing authority and contractor",
        "Public notices and the option to report an issue"
      ]
        .map((item) => "<li>" + icon("check") + "<span>" + item + "</span></li>")
        .join("") +
      "</ul></div></section>" +
      '<section class="panel"><div class="panel-head"><div>' +
      '<h3 class="panel-title">Restricted from public view</h3>' +
      '<p class="panel-sub">Available to the MP office and authorities</p></div></div>' +
      '<div class="panel-body"><ul class="bullet-list bullet-list--muted">' +
      [
        "Anomaly scores, audit flags and investigation notes",
        "Contractor contact details and bill-level expenditure",
        "Approval, sanction and administrative controls"
      ]
        .map((item) => "<li>" + icon("info") + "<span>" + item + "</span></li>")
        .join("") +
      "</ul></div></section></div>"
    );
  }

  /* ---------------- render ---------------- */

  function renderNav() {
    const items = NAV[role];
    sideNav.innerHTML =
      '<span class="nav-label">Workspace</span>' +
      items
        .map((item) => {
          const badge = item.badge ? item.badge() : 0;
          return (
            '<button class="nav-btn' +
            (state.view === item.id ? " is-active" : "") +
            '" type="button" data-view="' +
            item.id +
            '">' +
            icon(item.icon) +
            "<span>" +
            esc(item.label) +
            "</span>" +
            (badge ? '<span class="nav-badge">' + badge + "</span>" : "") +
            "</button>"
          );
        })
        .join("");
  }

  function renderShell() {
    document.getElementById("sideName").textContent = session.name;
    document.getElementById("sideRole").textContent = roleMeta.label;
    document.getElementById("sideAvatar").textContent = session.shortName
      .replace(/^The /, "")
      .slice(0, 1)
      .toUpperCase();
    document.getElementById("accessCopy").textContent = roleMeta.accessCopy;
    document.getElementById("rolePillText").textContent =
      roleMeta.label + " · " + roleMeta.access;

    const pill = document.getElementById("rolePill");
    pill.className = "role-pill role-pill--" + role;

    document.getElementById("topDate").textContent = new Date().toLocaleDateString(
      "en-IN",
      { weekday: "short", day: "numeric", month: "short", year: "numeric" }
    );
    document.getElementById("sideFootNote").textContent =
      "Prototype build · " + projects.length + " demo works";
  }

  function render() {
    renderNav();

    let html = "";
    let title = "Workspace";

    if (state.view === "detail") {
      const project = projectById(state.projectId);
      if (!project || scopedProjects().indexOf(project) === -1) {
        state.view = "projects";
        state.projectId = null;
        toast("That work is outside your access level.");
        return render();
      }
      html = detailHTML(project);
      title = project.id;
    } else if (state.view === "projects") {
      html = projectsHTML();
      title = VIEW_TITLES.projects[role];
    } else if (state.view === "alerts" && isMP) {
      html = alertsHTML();
      title = "Risk flags";
    } else if (state.view === "updates") {
      html = updatesViewHTML();
      title = isMP ? "Contractor updates" : "My update log";
    } else if (state.view === "notices" && isCitizen) {
      html = noticesHTML();
      title = "Notices";
    } else {
      state.view = "overview";
      html = overviewHTML();
      title = VIEW_TITLES.overview[role];
    }

    view.innerHTML = html;
    document.getElementById("viewTitle").textContent = title;
    window.scrollTo({ top: 0 });

    if (state.view === "detail" && isContractor) {
      bindUploadForm();
      renderPhotoGrid();
    }
  }

  function go(view, projectId) {
    state.view = view;
    if (view === "detail") {
      state.projectId = projectId;
      const project = projectById(projectId);
      if (project) {
        const today = todayISO();
        const maxLoggable = project.due < today ? project.due : today;
        state.selectedDate = isContractor
          ? clampISO(today, project.start, maxLoggable)
          : null;
        state.calMonth = monthStartISO(
          state.selectedDate ||
            (updatesFor(project.id)[0] || {}).date ||
            today
        );
        state.draftPhotos = [];
        state.geo = { status: "idle" };
      }
    } else {
      state.projectId = null;
    }
    closeMenu();
    render();
  }

  /* ---------------- upload form ---------------- */

  function currentProject() {
    return projectById(state.projectId);
  }

  function renderPhotoGrid() {
    const grid = document.getElementById("photoGrid");
    if (!grid) return;
    if (!state.draftPhotos.length) {
      grid.innerHTML = "";
      return;
    }
    grid.innerHTML = state.draftPhotos
      .map(
        (photo, index) =>
          '<div class="photo-card"><img src="' +
          photo.dataUrl +
          '" alt="Attached site photo ' +
          (index + 1) +
          '"><div class="photo-card-body">' +
          '<span class="photo-tag' +
          (photo.source === "device" ? "" : " photo-tag--pending") +
          '">' +
          icon("pin") +
          "<span>" +
          photo.lat.toFixed(4) +
          ", " +
          photo.lng.toFixed(4) +
          (photo.accuracy ? " ±" + photo.accuracy + "m" : "") +
          "</span></span>" +
          '<button class="photo-remove" type="button" data-action="remove-photo" data-index="' +
          index +
          '" aria-label="Remove photo">' +
          icon("trash") +
          "</button></div></div>"
      )
      .join("");
  }

  function updateGeoUI() {
    const status = document.getElementById("geoStatus");
    const lat = document.getElementById("geoLat");
    const lng = document.getElementById("geoLng");
    if (!status) return;
    const geo = state.geo;
    if (geo.status === "locating") {
      status.textContent = "Capturing device location…";
      return;
    }
    if (geo.status === "ready") {
      status.textContent =
        geo.source === "device"
          ? "Device location captured" + (geo.accuracy ? " · ±" + geo.accuracy + " m" : "")
          : "Using project coordinates — device location unavailable";
      if (lat) lat.value = geo.lat.toFixed(5);
      if (lng) lng.value = geo.lng.toFixed(5);
      return;
    }
    status.textContent = "Location not captured yet.";
  }

  function ensureGeo(project) {
    if (state.geo.status === "ready") return Promise.resolve(state.geo);
    if (state.geoPromise) return state.geoPromise;

    const fallback = () => {
      state.geo = {
        status: "ready",
        lat: project.location.lat,
        lng: project.location.lng,
        accuracy: null,
        source: "project"
      };
      state.geoPromise = null;
      updateGeoUI();
      return state.geo;
    };

    if (!("geolocation" in navigator)) {
      return Promise.resolve(fallback());
    }

    state.geo = { status: "locating" };
    updateGeoUI();

    state.geoPromise = new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        state.geoPromise = null;
        resolve(value);
      };
      const timer = window.setTimeout(() => finish(fallback()), 7000);

      navigator.geolocation.getCurrentPosition(
        (position) => {
          window.clearTimeout(timer);
          state.geo = {
            status: "ready",
            lat: Number(position.coords.latitude.toFixed(5)),
            lng: Number(position.coords.longitude.toFixed(5)),
            accuracy: position.coords.accuracy
              ? Math.round(position.coords.accuracy)
              : null,
            source: "device"
          };
          updateGeoUI();
          finish(state.geo);
        },
        () => {
          window.clearTimeout(timer);
          finish(fallback());
        },
        { enableHighAccuracy: true, timeout: 6000, maximumAge: 60000 }
      );
    });

    return state.geoPromise;
  }

  function compressImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("read-failed"));
      reader.onload = () => {
        const image = new Image();
        image.onerror = () => reject(new Error("decode-failed"));
        image.onload = () => {
          const max = 900;
          const scale = Math.min(1, max / Math.max(image.width, image.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(image.width * scale));
          canvas.height = Math.max(1, Math.round(image.height * scale));
          canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
          resolve({
            dataUrl: canvas.toDataURL("image/jpeg", 0.62),
            width: canvas.width,
            height: canvas.height
          });
        };
        image.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  async function handlePhotoFiles(fileList, project) {
    const files = Array.prototype.slice
      .call(fileList)
      .filter((file) => file.type.indexOf("image/") === 0);

    if (!files.length) {
      toast("Choose image files (JPG or PNG).");
      return;
    }

    const room = 3 - state.draftPhotos.length;
    if (room <= 0) {
      toast("Up to 3 photos per update.");
      return;
    }

    const geo = await ensureGeo(project);

    for (const file of files.slice(0, room)) {
      try {
        const image = await compressImage(file);
        state.draftPhotos.push({
          name: file.name,
          dataUrl: image.dataUrl,
          lat: geo.lat,
          lng: geo.lng,
          accuracy: geo.accuracy,
          source: geo.source
        });
      } catch (error) {
        toast("Could not read " + file.name + ".");
      }
    }

    if (files.length > room) {
      toast("Only the first " + room + " photos were attached.");
    }
    renderPhotoGrid();
  }

  function readMaterials() {
    const host = document.getElementById("materialsHost");
    if (!host) return [];
    return Array.prototype.slice
      .call(host.querySelectorAll(".material-row"))
      .map((row) => ({
        name: row.querySelector('[data-field="name"]').value.trim(),
        qty: Number(row.querySelector('[data-field="qty"]').value),
        unit: row.querySelector('[data-field="unit"]').value
      }))
      .filter((material) => material.name && material.qty > 0);
  }

  function bindUploadForm() {
    const project = currentProject();
    if (!project) return;

    const form = document.getElementById("updateForm");
    const range = document.getElementById("draftProgress");
    const progressValue = document.getElementById("progressValue");
    const materialsHost = document.getElementById("materialsHost");
    const photoDrop = document.getElementById("photoDrop");
    const photoInput = document.getElementById("photoInput");

    if (!form) return;

    range.addEventListener("input", () => {
      progressValue.textContent = range.value + "%";
    });

    document.getElementById("addMaterialBtn").addEventListener("click", () => {
      materialsHost.insertAdjacentHTML(
        "beforeend",
        materialRowHTML({ name: "", qty: "", unit: UNITS[0] })
      );
      const rows = materialsHost.querySelectorAll(".material-row");
      const last = rows[rows.length - 1];
      last.querySelector('[data-field="name"]').focus();
    });

    materialsHost.addEventListener("click", (event) => {
      const button = event.target.closest('[data-action="remove-material"]');
      if (!button) return;
      const rows = materialsHost.querySelectorAll(".material-row");
      if (rows.length === 1) {
        const row = rows[0];
        row.querySelector('[data-field="name"]').value = "";
        row.querySelector('[data-field="qty"]').value = "";
        return;
      }
      button.closest(".material-row").remove();
    });

    const openPicker = () => {
      ensureGeo(project);
      photoInput.click();
    };

    photoDrop.addEventListener("click", openPicker);
    photoDrop.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openPicker();
      }
    });

    ["dragenter", "dragover"].forEach((type) =>
      photoDrop.addEventListener(type, (event) => {
        event.preventDefault();
        photoDrop.classList.add("is-drag");
      })
    );

    ["dragleave", "drop"].forEach((type) =>
      photoDrop.addEventListener(type, (event) => {
        event.preventDefault();
        photoDrop.classList.remove("is-drag");
      })
    );

    photoDrop.addEventListener("drop", (event) => {
      if (event.dataTransfer && event.dataTransfer.files) {
        handlePhotoFiles(event.dataTransfer.files, project);
      }
    });

    photoInput.addEventListener("change", () => {
      handlePhotoFiles(photoInput.files, project);
      photoInput.value = "";
    });

    document.getElementById("clearDraft").addEventListener("click", () => {
      resetDraft(project);
      toast("Draft cleared.");
    });

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      submitUpdate(project);
    });
  }

  function resetDraft(project) {
    const form = document.getElementById("updateForm");
    if (form) form.reset();
    state.draftPhotos = [];
    const today = todayISO();
    const maxLoggable = project.due < today ? project.due : today;
    state.selectedDate = clampISO(today, project.start, maxLoggable);
    state.calMonth = monthStartISO(state.selectedDate);
    const range = document.getElementById("draftProgress");
    if (range) {
      range.value = project.progress;
      const label = document.getElementById("progressValue");
      if (label) label.textContent = project.progress + "%";
    }
    const host = document.getElementById("materialsHost");
    if (host) host.innerHTML = materialRowHTML({ name: "", qty: "", unit: UNITS[0] });
    renderPhotoGrid();
    syncDateUI(project);
    state.geo = { status: "idle" };
    updateGeoUI();
  }

  function syncDateUI(project) {
    const row = document.getElementById("draftDateRow");
    const text = document.getElementById("draftDateText");
    const sub = document.getElementById("draftDateSub");
    if (!row || !text || !sub) return;
    const today = todayISO();
    const maxLoggable = project.due < today ? project.due : today;
    if (state.selectedDate) {
      row.classList.remove("is-empty");
      text.textContent = fmtDate(state.selectedDate);
      sub.textContent =
        relativeDay(state.selectedDate) +
        " · within span " +
        fmtDate(project.start) +
        " – " +
        fmtDate(maxLoggable);
    } else {
      row.classList.add("is-empty");
      text.textContent = "No date selected";
      sub.textContent = "Select a day inside the sanctioned time span.";
    }
  }

  function submitUpdate(project) {
    const dateError = document.getElementById("dateError");
    const materialError = document.getElementById("materialError");
    const photoError = document.getElementById("photoError");
    const draftError = document.getElementById("draftError");
    const timeInput = document.getElementById("draftTimeValue");
    const noteInput = document.getElementById("draftNote");
    const latInput = document.getElementById("geoLat");
    const lngInput = document.getElementById("geoLng");
    const progress = Number(document.getElementById("draftProgress").value);

    dateError.textContent = "";
    materialError.textContent = "";
    photoError.textContent = "";
    draftError.textContent = "";

    let valid = true;

    if (!state.selectedDate) {
      dateError.textContent = "Select the date of this site update on the calendar.";
      valid = false;
    }

    const timeValue = Number(timeInput.value);
    if (!timeValue || timeValue <= 0) {
      draftError.textContent = "Enter the time taken for the reported work.";
      timeInput.classList.add("is-error");
      valid = false;
    } else {
      timeInput.classList.remove("is-error");
    }

    const materials = readMaterials();
    if (!materials.length) {
      materialError.textContent =
        "Add at least one raw material with a quantity — this is the record the MP office audits.";
      valid = false;
    }

    if (!state.draftPhotos.length) {
      photoError.textContent = "Attach at least one geotagged site photo.";
      valid = false;
    }

    const lat = Number(latInput.value);
    const lng = Number(lngInput.value);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      photoError.textContent = "Photo coordinates must be valid numbers.";
      valid = false;
    }

    if (!valid) {
      toast("Fix the highlighted fields before submitting.");
      return;
    }

    const update = {
      id: "u-" + Date.now(),
      projectId: project.id,
      date: state.selectedDate,
      progress,
      timeValue,
      timeUnit: document.getElementById("draftTimeUnit").value,
      materials,
      note: noteInput.value.trim(),
      photos: state.draftPhotos.map((photo) => ({
        name: photo.name,
        dataUrl: photo.dataUrl,
        lat,
        lng,
        accuracy: photo.accuracy,
        source: photo.source
      })),
      submittedBy: session.name,
      submittedAt: new Date().toISOString()
    };

    const nextUpdates = [update].concat(state.updates);
    if (!save(KEYS.updates, nextUpdates)) {
      toast("Browser storage is full. Remove an old photo-heavy entry and retry.");
      return;
    }

    state.updates = nextUpdates;
    state.overrides[project.id] = { progress, at: update.submittedAt };
    save(KEYS.overrides, state.overrides);
    rebuildProjects();

    toast(
      "Site update for " +
        fmtDate(update.date) +
        " submitted. The MP office can now see it."
    );
    go("detail", project.id);
  }

  /* ---------------- modal / toast ---------------- */

  function openModal(options) {
    state.lastFocus = document.activeElement;
    modalEyebrow.textContent = options.eyebrow || "";
    modalTitle.textContent = options.title || "";
    modalBody.innerHTML = options.body || "";
    modalFoot.innerHTML = (options.actions || [])
      .map(
        (action) =>
          '<button class="btn ' +
          (action.cls || "btn-ghost") +
          '" type="button" data-action="' +
          action.action +
          '"' +
          (action.id ? ' data-id="' + esc(action.id) + '"' : "") +
          ">" +
          (action.icon ? icon(action.icon) : "") +
          esc(action.label) +
          "</button>"
      )
      .join("");
    modal.classList.toggle("modal--wide", Boolean(options.wide));
    modalRoot.hidden = false;
    document.body.style.overflow = "hidden";

    const focusTarget =
      modalBody.querySelector("input, textarea, select, button") ||
      modalFoot.querySelector("button") ||
      modal.querySelector(".icon-btn");
    if (focusTarget) focusTarget.focus();
  }

  function closeModal() {
    if (modalRoot.hidden) return;
    modalRoot.hidden = true;
    modalBody.innerHTML = "";
    modalFoot.innerHTML = "";
    document.body.style.overflow = "";
    if (state.lastFocus && state.lastFocus.focus) state.lastFocus.focus();
  }

  let toastTimer = null;
  function toast(message) {
    toastText.textContent = message;
    toastEl.hidden = false;
    window.requestAnimationFrame(() => toastEl.classList.add("is-visible"));
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toastEl.classList.remove("is-visible");
      window.setTimeout(() => {
        toastEl.hidden = true;
      }, 220);
    }, 3200);
  }

  function reportModal(projectId) {
    const list = scopedProjects();
    openModal({
      eyebrow: "Public grievance",
      title: "Report an issue",
      body:
        '<div class="form-section"><label class="field-label" for="issueProject">Work</label>' +
        '<select class="select" id="issueProject" style="width:100%;height:38px">' +
        '<option value="">General / not about a specific work</option>' +
        list
          .map(
            (project) =>
              '<option value="' +
              esc(project.id) +
              '"' +
              (project.id === projectId ? " selected" : "") +
              ">" +
              esc(project.id) +
              " — " +
              esc(project.name) +
              "</option>"
          )
          .join("") +
        "</select></div>" +
        '<div class="form-section"><label class="field-label" for="issueNote">What did you observe?</label>' +
        '<textarea class="textarea" id="issueNote" placeholder="For example: work stopped two weeks ago, material stacked on the footpath, no board at site…"></textarea>' +
        '<p class="form-error" id="issueError"></p>' +
        '<p class="field-hint">Reports go to the MP office queue. Your name is recorded as the reporting citizen for this demo.</p></div>',
      actions: [
        { label: "Cancel", action: "close-modal" },
        { label: "Submit report", action: "submit-issue", cls: "btn-primary", icon: "flag" }
      ]
    });
  }

  function photoModal(updateId, index) {
    const update = state.updates.find((item) => item.id === updateId);
    if (!update) return;
    const photo = update.photos[Number(index)];
    if (!photo) return;
    const project = projectById(update.projectId);
    openModal({
      eyebrow: "Geotagged evidence",
      title: project ? project.name : update.projectId,
      wide: true,
      body:
        '<img src="' +
        photo.dataUrl +
        '" alt="Site photo uploaded on ' +
        fmtDate(update.date) +
        '">' +
        '<div class="log-stats">' +
        '<span class="chip">' +
        icon("calendar") +
        "<strong>" +
        fmtDate(update.date) +
        "</strong></span>" +
        '<span class="chip">' +
        icon("pin") +
        "<strong>" +
        photo.lat.toFixed(5) +
        ", " +
        photo.lng.toFixed(5) +
        "</strong>" +
        (photo.accuracy ? " ±" + photo.accuracy + " m" : "") +
        "</span>" +
        '<span class="chip">' +
        icon("camera") +
        "<strong>" +
        esc(photo.name) +
        "</strong></span>" +
        "</div>" +
        '<p class="field-hint">Coordinates are captured from the uploading device at submission time and stored with the photo.</p>',
      actions: [{ label: "Close", action: "close-modal" }]
    });
  }

  function dayUpdatesModal(date, projectId) {
    const updates = updatesFor(projectId).filter((update) => update.date === date);
    if (!updates.length) return;
    const project = projectById(projectId);
    openModal({
      eyebrow: fmtDate(date),
      title: project ? project.name : projectId,
      wide: true,
      body: updateLogHTML(updates, { showProject: false }),
      actions: [{ label: "Close", action: "close-modal" }]
    });
  }

  /* ---------------- actions ---------------- */

  function exportCSV(projectId) {
    const list = projectId
      ? [projectById(projectId)].filter(Boolean)
      : state.view === "alerts"
        ? watchProjects()
        : scopedProjects();

    if (!list.length) {
      toast("Nothing to export.");
      return;
    }

    const header = [
      "project_id",
      "work",
      "category",
      "location",
      "mp",
      "authority",
      "contractor",
      "sanctioned_inr",
      "spent_inr",
      "utilisation_pct",
      "progress_pct",
      "status",
      "start",
      "due",
      isMP ? "risk_score" : null,
      isMP ? "risk_level" : null,
      isMP ? "audit_flag" : null
    ].filter(Boolean);

    const rows = list.map((project) => {
      const base = [
        project.id,
        project.name,
        project.category,
        locationLabel(project),
        project.mp.name,
        project.authority,
        project.contractor.name,
        project.sanctioned,
        project.spent,
        Math.round((project.spent / project.sanctioned) * 100),
        project.progress,
        project.status,
        project.start,
        project.due
      ];
      if (isMP) {
        base.push(
          project.risk.toFixed(2),
          riskLevel(project.risk),
          isFlagged(project.id) ? "yes" : "no"
        );
      }
      return base;
    });

    const csv = [header]
      .concat(rows)
      .map((row) =>
        row
          .map((cell) => {
            const value = String(cell == null ? "" : cell);
            return /[",\n]/.test(value) ? '"' + value.replace(/"/g, '""') + '"' : value;
          })
          .join(",")
      )
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "sahayog-" + role + "-" + todayISO() + ".csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast("Exported " + list.length + " works to CSV.");
  }

  function toggleFlag(projectId) {
    const index = state.projectFlags.indexOf(projectId);
    if (index === -1) {
      state.projectFlags.push(projectId);
      save(KEYS.projectFlags, state.projectFlags);
      toast("Flagged for audit. The contractor can see this flag.");
    } else {
      state.projectFlags.splice(index, 1);
      save(KEYS.projectFlags, state.projectFlags);
      toast("Audit flag removed.");
    }
    render();
  }

  function toggleProjectReview(projectId) {
    const index = state.projectReviews.indexOf(projectId);
    if (index === -1) {
      state.projectReviews.push(projectId);
      save(KEYS.projectReviews, state.projectReviews);
      toast("Marked as reviewed.");
    } else {
      state.projectReviews.splice(index, 1);
      save(KEYS.projectReviews, state.projectReviews);
      toast("Returned to the risk queue.");
    }
    render();
  }

  function reviewUpdate(updateId, status) {
    const review = { status, at: new Date().toISOString() };
    if (status === "flagged") {
      review.note =
        "Flagged for audit — submitted evidence does not match the billed quantum. Contractor has been notified.";
    } else {
      review.note = "Accepted. Physical progress verified against the submitted evidence.";
    }
    state.reviews[updateId] = review;
    if (!save(KEYS.reviews, state.reviews)) {
      toast("Could not save the review.");
      return;
    }
    toast(status === "approved" ? "Submission accepted." : "Submission flagged for audit.");
    render();
  }

  function requestInfo(projectId) {
    const project = projectById(projectId);
    if (!project) return;
    openModal({
      eyebrow: project.id,
      title: "Request clarification",
      body:
        '<div class="form-section"><label class="field-label" for="requestNote">Message to ' +
        esc(project.contractor.name) +
        '</label><textarea class="textarea" id="requestNote" placeholder="Ask for measurement books, photos of a specific stretch, or material invoices…"></textarea>' +
        '<p class="field-hint">The contractor sees this on the work page in the demo build.</p></div>',
      actions: [
        { label: "Cancel", action: "close-modal" },
        {
          label: "Send request",
          action: "send-request",
          cls: "btn-primary",
          icon: "doc",
          id: projectId
        }
      ]
    });
  }

  function sendRequest(projectId) {
    const note = document.getElementById("requestNote");
    if (!note || !note.value.trim()) {
      toast("Write the clarification you need.");
      return;
    }
    closeModal();
    toast("Clarification request sent to the contractor.");
  }

  function submitIssue() {
    const note = document.getElementById("issueNote");
    const projectSelect = document.getElementById("issueProject");
    const error = document.getElementById("issueError");
    if (!note.value.trim()) {
      error.textContent = "Describe what you observed.";
      note.classList.add("is-error");
      note.focus();
      return;
    }
    state.issues.push({
      projectId: projectSelect.value || null,
      note: note.value.trim(),
      by: session.name,
      at: new Date().toISOString()
    });
    save(KEYS.issues, state.issues);
    closeModal();
    toast("Report submitted to the MP office queue.");
    render();
  }

  function resetDemoData() {
    Object.keys(KEYS).forEach((key) => localStorage.removeItem(KEYS[key]));
    toast("Demo data reset.");
    window.setTimeout(() => window.location.reload(), 700);
  }

  function openMenu() {
    app.classList.add("menu-open");
  }

  function closeMenu() {
    app.classList.remove("menu-open");
  }

  /* ---------------- events ---------------- */

  document.addEventListener("click", (event) => {
    const navButton = event.target.closest("[data-view]");
    if (navButton) {
      event.preventDefault();
      const target = navButton.dataset.view;
      if (target !== state.view) {
        state.search = "";
        state.status = "all";
        state.category = "all";
      }
      go(target);
      return;
    }

    const actionEl = event.target.closest("[data-action]");
    if (!actionEl) return;

    const action = actionEl.dataset.action;
    const id = actionEl.dataset.id;

    switch (action) {
      case "open-project":
        event.preventDefault();
        go("detail", id);
        break;
      case "pick-date": {
        event.preventDefault();
        const project = currentProject();
        if (!project) break;
        state.selectedDate = actionEl.dataset.date;
        const host = document.getElementById("calendarHost");
        if (host) host.innerHTML = calendarHTML(project);
        syncDateUI(project);
        const dateError = document.getElementById("dateError");
        if (dateError) dateError.textContent = "";
        const existing = updatesFor(project.id).filter(
          (update) => update.date === state.selectedDate
        );
        if (existing.length) {
          toast(existing.length + " update(s) already logged on this date.");
        }
        break;
      }
      case "cal-prev":
      case "cal-next": {
        event.preventDefault();
        const project = currentProject();
        if (!project) break;
        const current = parseISO(state.calMonth);
        const next = new Date(
          current.getFullYear(),
          current.getMonth() + (action === "cal-next" ? 1 : -1),
          1
        );
        state.calMonth = isoOf(next);
        document.getElementById("calendarHost").innerHTML = calendarHTML(project);
        break;
      }
      case "focus-form": {
        event.preventDefault();
        const panel = document.getElementById("uploadPanel");
        if (panel) {
          panel.scrollIntoView({ behavior: "smooth", block: "center" });
          const range = document.getElementById("draftProgress");
          if (range) range.focus();
        }
        break;
      }
      case "remove-photo": {
        event.preventDefault();
        state.draftPhotos.splice(Number(actionEl.dataset.index), 1);
        renderPhotoGrid();
        break;
      }
      case "toggle-flag":
        event.preventDefault();
        toggleFlag(id);
        break;
      case "review-project":
        event.preventDefault();
        toggleProjectReview(id);
        break;
      case "review-update":
        event.preventDefault();
        reviewUpdate(id, actionEl.dataset.status);
        break;
      case "request-info":
        event.preventDefault();
        requestInfo(id);
        break;
      case "send-request":
        event.preventDefault();
        sendRequest(id);
        break;
      case "report":
        event.preventDefault();
        reportModal(id);
        break;
      case "submit-issue":
        event.preventDefault();
        submitIssue();
        break;
      case "view-photo":
        event.preventDefault();
        photoModal(actionEl.dataset.update, actionEl.dataset.photo);
        break;
      case "open-day":
        event.preventDefault();
        dayUpdatesModal(actionEl.dataset.date, id);
        break;
      case "export-csv":
        event.preventDefault();
        exportCSV(id);
        break;
      case "reset-demo":
        event.preventDefault();
        resetDemoData();
        break;
      case "close-modal":
        event.preventDefault();
        closeModal();
        break;
      default:
        break;
    }
  });

  document.addEventListener("input", (event) => {
    if (event.target.id === "projectSearch") {
      state.search = event.target.value;
      const host = document.getElementById("tableHost");
      const count = document.getElementById("tableCount");
      if (host) host.innerHTML = projectsTableHTML();
      if (count) {
        count.textContent =
          filteredProjects().length + " of " + scopedProjects().length + " works";
      }
    }
  });

  document.addEventListener("change", (event) => {
    if (event.target.id === "statusFilter") {
      state.status = event.target.value;
      document.getElementById("tableHost").innerHTML = projectsTableHTML();
      const count = document.getElementById("tableCount");
      if (count) {
        count.textContent =
          filteredProjects().length + " of " + scopedProjects().length + " works";
      }
    }
    if (event.target.id === "categoryFilter") {
      state.category = event.target.value;
      document.getElementById("tableHost").innerHTML = projectsTableHTML();
      const count = document.getElementById("tableCount");
      if (count) {
        count.textContent =
          filteredProjects().length + " of " + scopedProjects().length + " works";
      }
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (!modalRoot.hidden) {
        closeModal();
      } else {
        closeMenu();
      }
    }
  });

  document.getElementById("menuBtn").addEventListener("click", openMenu);
  scrim.addEventListener("click", closeMenu);

  document.getElementById("logoutBtn").addEventListener("click", async () => {
    const button = document.getElementById("logoutBtn");
    button.disabled = true;
    try {
      await SahayogAuth.clearSession();
      window.location.href = "/";
    } catch (error) {
      button.disabled = false;
      toast(error.message || "Sign out failed. Please try again.");
    }
  });

  const resetButton = document.createElement("button");
  resetButton.type = "button";
  resetButton.className = "logout";
  resetButton.dataset.action = "reset-demo";
  resetButton.innerHTML = icon("updates") + "Reset demo data";
  document.querySelector(".side-foot").insertBefore(
    resetButton,
    document.getElementById("logoutBtn")
  );

  /* ---------------- init ---------------- */

  renderShell();
  render();
})();
