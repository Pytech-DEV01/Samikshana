(function () {
  const session = SahayogAuth.requireSession();
  if (!session) return;

  const csrfToken = document.querySelector('meta[name="csrf-token"]').content;
  const role = SahayogAuth.ROLES[session.role];
  const isContractor = session.role === "contractor";
  const canAssign = ["mp", "state_authority", "district_authority", "nodal_officer", "ministry"].includes(session.role);
  const projects = new Map();
  let selectedProjectId = "";
  let capturedLocation = null;
  let calendarMonth = null;
  const DAY_MS = 86400000;
  const currency = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  });
  const monthLabel = new Intl.DateTimeFormat("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  });

  function byId(id) {
    return document.getElementById(id);
  }

  function make(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function setMessage(target, text, kind) {
    target.textContent = text;
    target.classList.toggle("is-error", kind === "error");
    target.classList.toggle("is-success", kind === "success");
  }

  async function responseJson(response) {
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.error || `Request failed (${response.status}).`);
    }
    return result;
  }

  function formatDate(value) {
    return new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC"
    }).format(new Date(`${value}T00:00:00Z`));
  }

  function localDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function utcFromIso(value) {
    const [year, month, day] = value.split("-").map(Number);
    return Date.UTC(year, month - 1, day);
  }

  function isoFromUtc(ms) {
    const stamp = new Date(ms);
    return `${stamp.getUTCFullYear()}-${String(stamp.getUTCMonth() + 1).padStart(2, "0")}-${String(stamp.getUTCDate()).padStart(2, "0")}`;
  }

  function monthFromUtc(ms) {
    const stamp = new Date(ms);
    return Date.UTC(stamp.getUTCFullYear(), stamp.getUTCMonth(), 1);
  }

  function reportWindow(project) {
    const latest = project.reports[0];
    const today = localDateString(new Date());
    const min = latest ? isoFromUtc(utcFromIso(latest.report_date) + DAY_MS) : project.start_date;
    const max = project.end_date < today ? project.end_date : today;
    return { latest, min, max, open: max >= min };
  }

  function projectCard(project) {
    const button = make("button", "project-card");
    button.type = "button";
    button.dataset.projectId = project.id;
    button.append(
      make("strong", "", project.title),
      make("span", "", `${project.mp_name} · ${project.constituency}`),
      make("span", "", `${currency.format(project.sanctioned_amount)} · ${project.reports.length} update${project.reports.length === 1 ? "" : "s"}`),
      make("span", "", `${formatDate(project.start_date)} – ${formatDate(project.end_date)}`)
    );
    button.addEventListener("click", () => selectProject(project.id));
    return button;
  }

  function detailField(label, value) {
    const field = make("div", "detail-field");
    field.append(make("span", "detail-label", label), make("strong", "", value || "Not provided"));
    return field;
  }

  function renderHistory(project) {
    const history = byId("reportHistory");
    if (!project.reports.length) {
      history.replaceChildren(make("div", "empty-projects", "No progress updates have been submitted for this project."));
      return;
    }
    const entries = project.reports.map((report) => {
      const entry = make("article", "report-entry");
      entry.dataset.reportDate = report.report_date;
      const heading = make("div", "report-entry-head");
      heading.append(
        make("strong", "", `${formatDate(report.report_date)} · ${Number(report.completion_percent).toFixed(1)}% complete`),
        make("span", "", `${Number(report.hours_worked).toFixed(1)} hours`)
      );
      entry.append(heading);
      const reviewStatus = report.review_status || "pending";
      entry.append(
        make(
          "span",
          `review-status review-status--${reviewStatus}`,
          `Review: ${reviewStatus.replaceAll("_", " ")}`
        )
      );
      entry.append(make("p", "", `Materials: ${report.materials}`));
      if (report.notes) entry.append(make("p", "", report.notes));
      if (report.review_note) {
        entry.append(make("p", "review-note", `Authority note: ${report.review_note}`));
      }
      const location = make("a", "external-link", `Captured site location: ${Number(report.latitude).toFixed(6)}, ${Number(report.longitude).toFixed(6)}`);
      location.href = `https://www.google.com/maps?q=${encodeURIComponent(`${report.latitude},${report.longitude}`)}`;
      location.target = "_blank";
      location.rel = "noopener noreferrer";
      entry.append(location);
      if (report.photos.length) {
        const photos = make("div", "report-photos");
        report.photos.forEach((photo) => {
          const link = document.createElement("a");
          link.href = photo.url;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.setAttribute("aria-label", `Open progress photo: ${photo.filename}`);
          const image = document.createElement("img");
          image.src = photo.url;
          image.alt = `Site photo uploaded ${formatDate(report.report_date)}`;
          image.loading = "lazy";
          link.append(image);
          photos.append(link);
        });
        entry.append(photos);
      }
      if (canAssign && !["approved", "rejected"].includes(reviewStatus)) {
        const reviewForm = make("form", "report-review-form");
        const reviewNote = document.createElement("textarea");
        reviewNote.maxLength = 1000;
        reviewNote.rows = 2;
        reviewNote.placeholder = "Required for reject or clarification; optional for accept";
        reviewNote.setAttribute("aria-label", `Review note for ${formatDate(report.report_date)}`);
        const actions = make("div", "report-review-actions");
        const reviewFeedback = make("p", "form-message");
        reviewFeedback.setAttribute("role", "status");
        [
          ["approved", "Accept"],
          ["rejected", "Reject"],
          ["clarification_requested", "Request clarification"]
        ].forEach(([status, label]) => {
          const button = make("button", "secondary-button", label);
          button.type = "button";
          button.addEventListener("click", async () => {
            if (["rejected", "clarification_requested"].includes(status) && !reviewNote.value.trim()) {
              setMessage(reviewFeedback, "Add a short reason before rejecting or requesting clarification.", "error");
              reviewNote.focus();
              return;
            }
            button.disabled = true;
            try {
              const result = await responseJson(await fetch(
                `/api/projects/${encodeURIComponent(project.id)}/reports/${encodeURIComponent(report.id)}/review`,
                {
                  method: "POST",
                  credentials: "same-origin",
                  headers: {
                    "Content-Type": "application/json",
                    "X-CSRF-Token": csrfToken
                  },
                  body: JSON.stringify({ status, note: reviewNote.value.trim() })
                }
              ));
              setMessage(reviewFeedback, result.message, "success");
              await loadProjects(project.id);
            } catch (error) {
              setMessage(reviewFeedback, error.message, "error");
            } finally {
              button.disabled = false;
            }
          });
          actions.append(button);
        });
        reviewForm.append(reviewNote, actions, reviewFeedback);
        entry.append(reviewForm);
      }
      return entry;
    });
    history.replaceChildren(...entries);
  }

  function renderConversation(project) {
    const history = byId("conversationHistory");
    const messages = project.messages || [];
    if (!messages.length) {
      history.replaceChildren(make("div", "empty-projects", "No review or clarification messages yet."));
    } else {
      history.replaceChildren(...messages.map((message) => {
        const entry = make("article", "conversation-entry");
        const heading = make("div", "conversation-entry-heading");
        const typeLabel = message.message_type.replaceAll("_", " ");
        heading.append(
          make("strong", "", message.sender_name),
          make("span", "", `${message.sender_role.replaceAll("_", " ")} · ${typeLabel} · ${formatDate(message.created_at.slice(0, 10))}`)
        );
        entry.append(heading, make("p", "", message.message));
        return entry;
      }));
    }

    const typeSelect = byId("messageType");
    typeSelect.replaceChildren();
    const messageOptions = isContractor
      ? [["message", "Message"], ["clarification_response", "Clarification response"]]
      : [["message", "Message"], ["review", "Review note"], ["clarification_request", "Request clarification"]];
    messageOptions.forEach(([value, label]) => typeSelect.add(new Option(label, value)));
  }

  function initConversationForm() {
    byId("conversationForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!selectedProjectId) return;
      const button = byId("sendMessage");
      button.disabled = true;
      setMessage(byId("conversationStatus"), "Sending project message…", "");
      try {
        const result = await responseJson(await fetch(
          `/api/projects/${encodeURIComponent(selectedProjectId)}/messages`,
          {
            method: "POST",
            credentials: "same-origin",
            headers: {
              "Content-Type": "application/json",
              "X-CSRF-Token": csrfToken
            },
            body: JSON.stringify({
              message_type: byId("messageType").value,
              message: byId("messageText").value.trim()
            })
          }
        ));
        byId("messageText").value = "";
        setMessage(byId("conversationStatus"), "Message sent to the project authorities and assigned contractor.", "success");
        await loadProjects(selectedProjectId);
      } catch (error) {
        setMessage(byId("conversationStatus"), error.message, "error");
      } finally {
        button.disabled = false;
      }
    });
  }

  function updateReportSchedule(project) {
    const input = byId("reportDate");
    const { latest, min, max, open } = reportWindow(project);
    input.min = min;
    input.max = max;
    input.value = open ? max : "";
    input.disabled = !open;
    const progressInput = byId("reportForm").elements.completion_percent;
    progressInput.min = latest ? String(latest.completion_percent) : "0";
    byId("submitReport").disabled = !open;
    if (!open) {
      setMessage(byId("reportMessage"), "The project schedule has no remaining report dates.", "error");
    } else {
      setMessage(byId("reportMessage"), "", "");
    }
  }

  function calendarDay(project, iso, report, bounds, inMonth) {
    const inSpan = iso >= project.start_date && iso <= project.end_date;
    const reportable = isContractor && bounds.open && iso >= bounds.min && iso <= bounds.max;
    const selected = isContractor && byId("reportDate").value === iso;
    const classes = ["cal-day"];
    if (!inMonth || !inSpan) classes.push("is-outside");
    if (report) classes.push("is-reported");
    if (reportable) classes.push("is-open");
    if (selected) classes.push("is-selected");
    if (iso === localDateString(new Date())) classes.push("is-today");

    const label = formatDate(iso);
    let cell;
    if (inMonth && (reportable || report)) {
      cell = make("button", classes.join(" "));
      cell.type = "button";
      cell.dataset.date = iso;
      cell.setAttribute(
        "aria-label",
        report
          ? `${label} — update submitted, ${Number(report.completion_percent).toFixed(1)}% complete`
          : `${label} — available for a progress update`
      );
      if (reportable) {
        cell.addEventListener("click", () => {
          byId("reportDate").value = iso;
          renderCalendar(project);
          setMessage(
            byId("reportMessage"),
            `Report date set to ${label}. Complete the update below.`,
            ""
          );
        });
      } else {
        cell.addEventListener("click", () => {
          const entry = document.querySelector(`.report-entry[data-report-date="${iso}"]`);
          if (!entry) return;
          entry.scrollIntoView({ block: "center", behavior: "smooth" });
          entry.classList.add("is-flash");
          window.setTimeout(() => entry.classList.remove("is-flash"), 1600);
        });
      }
    } else {
      cell = make("span", classes.join(" "));
      cell.setAttribute("aria-hidden", inMonth && inSpan ? "false" : "true");
    }
    cell.append(make("span", "cal-day-num", String(Number(iso.slice(8)))));
    if (report) cell.append(make("span", "cal-dot", ""));
    return cell;
  }

  function renderCalendar(project) {
    const grid = byId("calGrid");
    const bounds = reportWindow(project);
    const spanStart = utcFromIso(project.start_date);
    const spanEnd = utcFromIso(project.end_date);
    const firstMonth = monthFromUtc(spanStart);
    const lastMonth = monthFromUtc(spanEnd);
    const today = utcFromIso(localDateString(new Date()));
    const anchor = Math.min(Math.max(today, spanStart), spanEnd);

    if (calendarMonth === null || calendarMonth < firstMonth || calendarMonth > lastMonth) {
      calendarMonth = monthFromUtc(anchor);
    }

    const reports = new Map(project.reports.map((report) => [report.report_date, report]));
    const monthDate = new Date(calendarMonth);
    const offset = (monthDate.getUTCDay() + 6) % 7;
    const cells = [];
    for (let index = 0; index < 42; index += 1) {
      const ms = calendarMonth - offset * DAY_MS + index * DAY_MS;
      const iso = isoFromUtc(ms);
      cells.push(calendarDay(project, iso, reports.get(iso) || null, bounds, monthFromUtc(ms) === calendarMonth));
    }
    grid.replaceChildren(...cells);

    byId("calMonthLabel").textContent = monthLabel.format(monthDate);
    byId("calPrev").disabled = calendarMonth <= firstMonth;
    byId("calNext").disabled = calendarMonth >= lastMonth;

    const spanDays = Math.round((spanEnd - spanStart) / DAY_MS) + 1;
    const elapsed = Math.min(Math.max(Math.round((today - spanStart) / DAY_MS) + 1, 0), spanDays);
    const reported = project.reports.length;
    byId("calendarSummary").textContent = bounds.open
      ? `${spanDays}-day span · day ${elapsed} elapsed · ${reported} dated update${reported === 1 ? "" : "s"} submitted`
      : `${spanDays}-day span · ${reported} dated update${reported === 1 ? "" : "s"} submitted · no report dates left in this schedule`;
  }

  function shiftMonth(direction) {
    const project = projects.get(selectedProjectId);
    if (!project || calendarMonth === null) return;
    const current = new Date(calendarMonth);
    const next = Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + direction, 1);
    const first = monthFromUtc(utcFromIso(project.start_date));
    const last = monthFromUtc(utcFromIso(project.end_date));
    calendarMonth = Math.min(Math.max(next, first), last);
    renderCalendar(project);
  }

  function selectProject(projectId) {
    const project = projects.get(projectId);
    if (!project) return;
    selectedProjectId = projectId;
    document.querySelectorAll(".project-card").forEach((card) => {
      card.classList.toggle("is-selected", card.dataset.projectId === projectId);
    });
    byId("emptyDetail").hidden = true;
    byId("projectDetail").hidden = false;
    const summary = byId("projectSummary");
    const title = make("h2", "", project.title);
    const description = make("p", "project-meta", project.description || "No additional scope description.");
    const fields = make("div", "detail-grid");
    fields.append(
      detailField("Total sanctioned amount", currency.format(project.sanctioned_amount)),
      detailField("Assigned contractor", project.contractor_name || project.contractor_email),
      detailField("MP", project.mp_name),
      detailField("Constituency", project.constituency),
      detailField("State / district", `${project.state} · ${project.district}`),
      detailField("Project location", project.location)
    );
    summary.replaceChildren(title, description, fields);
    byId("scheduleText").textContent = `${formatDate(project.start_date)} – ${formatDate(project.end_date)}`;
    byId("latestProgress").textContent = project.reports.length
      ? `${Number(project.reports[0].completion_percent).toFixed(1)}% · as of ${formatDate(project.reports[0].report_date)}`
      : "No update submitted";
    byId("reportSection").hidden = !isContractor;
    renderHistory(project);
    renderConversation(project);
    if (isContractor) updateReportSchedule(project);
    calendarMonth = null;
    renderCalendar(project);
  }

  async function loadProjects(preferredProjectId) {
    const message = byId("loadMessage");
    setMessage(message, "Loading project assignments…", "");
    try {
      const result = await responseJson(await fetch("/api/projects", {
        credentials: "same-origin",
        headers: { Accept: "application/json" }
      }));
      projects.clear();
      result.projects.forEach((project) => projects.set(project.id, project));
      const projectList = byId("projectList");
      const list = result.projects.map(projectCard);
      if (!list.length) {
        const emptyText = isContractor
          ? "No projects are assigned to your sign-in email yet. Ask an authorized official to assign one to this exact email."
          : "No projects are visible in your authorized scope yet. Assign a project using the form above or contact the relevant authority.";
        projectList.replaceChildren(make("div", "empty-projects", emptyText));
      } else {
        projectList.replaceChildren(...list);
      }
      byId("projectCount").textContent = `${result.projects.length} project${result.projects.length === 1 ? "" : "s"}`;
      setMessage(message, "", "");
      const nextProject = projects.has(preferredProjectId)
        ? preferredProjectId
        : projects.has(selectedProjectId)
          ? selectedProjectId
          : result.projects[0]?.id;
      if (nextProject) selectProject(nextProject);
      else {
        byId("projectDetail").hidden = true;
        byId("emptyDetail").hidden = false;
      }
    } catch (error) {
      setMessage(message, error.message, "error");
    }
  }

  function initAssignmentForm() {
    const form = byId("assignmentForm");
    if (!canAssign) {
      byId("assignmentPanel").hidden = true;
      return;
    }
    byId("assignmentPanel").hidden = false;
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = form.querySelector('button[type="submit"]');
      const message = byId("assignmentMessage");
      button.disabled = true;
      setMessage(message, "Saving project assignment…", "");
      const values = Object.fromEntries(new FormData(form).entries());
      values.sanctioned_amount = Number(values.sanctioned_amount);
      try {
        const result = await responseJson(await fetch("/api/projects", {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrfToken
          },
          body: JSON.stringify(values)
        }));
        form.reset();
        setMessage(message, result.message, "success");
        await loadProjects(result.project_id);
      } catch (error) {
        setMessage(message, error.message, "error");
      } finally {
        button.disabled = false;
      }
    });
  }

  function initReportForm() {
    const form = byId("reportForm");
    byId("captureLocation").addEventListener("click", () => {
      const status = byId("locationStatus");
      if (!navigator.geolocation) {
        setMessage(status, "This browser does not support location capture.", "error");
        return;
      }
      status.textContent = "Requesting browser location permission…";
      navigator.geolocation.getCurrentPosition(
        (position) => {
          capturedLocation = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          };
          form.elements.latitude.value = String(capturedLocation.latitude);
          form.elements.longitude.value = String(capturedLocation.longitude);
          status.textContent = `Location captured: ${capturedLocation.latitude.toFixed(6)}, ${capturedLocation.longitude.toFixed(6)}. Browser coordinates are not independently verified.`;
        },
        () => {
          capturedLocation = null;
          form.elements.latitude.value = "";
          form.elements.longitude.value = "";
          setMessage(status, "Location was not captured. Allow location access and try again.", "error");
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!selectedProjectId) return;
      if (!capturedLocation) {
        setMessage(byId("reportMessage"), "Capture the work-site location before submitting.", "error");
        return;
      }
      const photoFiles = Array.from(form.elements.photos.files || []);
      if (!photoFiles.length || photoFiles.length > 4) {
        setMessage(byId("reportMessage"), "Select between one and four site photos.", "error");
        return;
      }
      const submitButton = byId("submitReport");
      submitButton.disabled = true;
      setMessage(byId("reportMessage"), "Uploading progress report and photos…", "");
      const formData = new FormData(form);
      formData.set("latitude", String(capturedLocation.latitude));
      formData.set("longitude", String(capturedLocation.longitude));
      try {
        await responseJson(await fetch(`/api/projects/${encodeURIComponent(selectedProjectId)}/reports`, {
          method: "POST",
          credentials: "same-origin",
          headers: { "X-CSRF-Token": csrfToken },
          body: formData
        }));
        capturedLocation = null;
        form.reset();
        byId("locationStatus").textContent = "Capture your current site coordinates before submitting.";
        setMessage(byId("reportMessage"), "Progress report submitted and shared with authorized project officials.", "success");
        await loadProjects(selectedProjectId);
      } catch (error) {
        setMessage(byId("reportMessage"), error.message, "error");
      } finally {
        submitButton.disabled = false;
      }
    });
  }

  async function start() {
    if (!role || !["contractor", "mp", "state_authority", "district_authority", "nodal_officer", "ministry"].includes(session.role)) {
      window.location.replace("/");
      return;
    }
    byId("userName").textContent = session.shortName || session.name || role.label;
    byId("userRole").textContent = role.label;
    byId("sidebarRole").textContent = role.label;
    byId("userAvatar").textContent = (session.shortName || session.name || role.label).charAt(0).toUpperCase();
    byId("pageTitle").textContent = isContractor ? "My assigned projects" : "Project oversight";
    byId("pageDescription").textContent = isContractor
      ? "Open an assigned project to review its sanction, schedule, MP and site, then submit dated progress updates."
      : "Assign contractors to scheduled projects and review submitted work updates within your authorized scope.";
    byId("projectListTitle").textContent = isContractor ? "My projects" : "Projects in your scope";
    byId("dashboardLink").hidden = isContractor;
    byId("pastWorksLink").hidden = isContractor;
    initAssignmentForm();
    if (isContractor) initReportForm();
    initConversationForm();
    byId("calPrev").addEventListener("click", () => shiftMonth(-1));
    byId("calNext").addEventListener("click", () => shiftMonth(1));
    byId("reportDate").addEventListener("change", () => {
      const project = projects.get(selectedProjectId);
      if (project && isContractor) renderCalendar(project);
    });
    byId("logoutBtn").addEventListener("click", async () => {
      try {
        await SahayogAuth.clearSession();
        window.location.replace("/");
      } catch (error) {
        window.alert(error.message);
      }
    });
    await loadProjects("");
  }

  start();
})();
