(() => {
  const session = window.SahayogSession || {};
  const authorityRoles = ["mp", "state_authority", "district_authority", "nodal_officer", "ministry"];
  const byId = (id) => document.getElementById(id);
  const typeFilter = byId("typeFilter");
  const stateFilter = byId("stateFilter");
  const searchFilter = byId("searchFilter");
  const body = byId("worksBody");
  const summary = byId("historySummary");
  let page = 1;
  let totalPages = 1;
  let searchTimer;

  function cellText(tag, value, className) {
    const element = document.createElement(tag);
    element.textContent = value || "—";
    if (className) element.className = className;
    return element;
  }

  function mapQuery(work) {
    return [work.description, work.constituency, work.state, work.ida].filter(Boolean).join(", ");
  }

  function renderRows(works) {
    body.replaceChildren();
    if (!works.length) {
      const row = document.createElement("tr");
      const cell = cellText("td", "No works found in your scope.");
      cell.colSpan = 7;
      row.append(cell);
      body.append(row);
      return;
    }

    for (const work of works) {
      const row = document.createElement("tr");
      const description = document.createElement("td");
      description.append(cellText("div", work.description, "work-description"));
      description.append(cellText("small", `ID: ${work.work_id || "—"} · ${work.category || "Uncategorized"}`, "work-meta"));
      row.append(description);
      row.append(cellText("td", work.type === "completed" ? "Completed" : "Recommended"));
      row.append(cellText("td", work.amount ? `₹${work.amount}` : "—"));
      const mpCell = document.createElement("td");
      mpCell.append(cellText("div", work.mp_name));
      mpCell.append(cellText("small", `${work.constituency || "—"}${work.house ? ` · ${work.house}` : ""}`, "work-meta"));
      row.append(mpCell);
      const placeCell = document.createElement("td");
      placeCell.append(cellText("div", [work.state, work.ida].filter(Boolean).join(" · ") || "—"));
      placeCell.append(cellText("small", work.ida ? `Implementing authority: ${work.ida}` : "Implementing authority not listed", "work-meta"));
      row.append(placeCell);
      row.append(cellText("td", work.date));

      const mapCell = document.createElement("td");
      const mapButton = cellText("button", "Search map", "map-search-button");
      mapButton.type = "button";
      mapButton.addEventListener("click", () => showMap(work));
      mapCell.append(mapButton);
      row.append(mapCell);
      body.append(row);
    }
  }

  function showMap(work) {
    const query = mapQuery(work);
    if (!query) return;
    const encoded = encodeURIComponent(query);
    byId("mapTitle").textContent = work.description || "Approximate work location";
    byId("mapFrame").src = `https://www.google.com/maps?q=${encoded}&output=embed`;
    byId("openGoogleMaps").href = `https://www.google.com/maps/search/?api=1&query=${encoded}`;
    byId("mapDialog").showModal();
  }

  async function loadWorks() {
    summary.textContent = "Loading historical works…";
    const params = new URLSearchParams({
      type: typeFilter.value,
      state: stateFilter.value,
      search: searchFilter.value.trim(),
      page: String(page),
    });
    try {
      const response = await fetch(`/api/past-works?${params}`, { credentials: "same-origin" });
      if (!response.ok) {
        if (response.status === 403 && session.role === "mp") {
          throw new Error("Your account needs a verified state and constituency assignment before it can show historical works. Contact an administrator.");
        }
        if (response.status === 403 && session.role === "district_authority") {
          throw new Error("Your account needs a verified state and district assignment before it can show historical works. Contact an administrator.");
        }
        if (response.status === 403 && session.role === "state_authority") {
          throw new Error("Your account needs a verified state assignment before it can show historical works. Contact an administrator.");
        }
        throw new Error(response.status === 403 ? "You are not authorized to view historical works." : "Historical works could not be loaded.");
      }
      const result = await response.json();
      const priorState = stateFilter.value;
      stateFilter.replaceChildren(new Option("All in my scope", ""));
      for (const state of result.states) stateFilter.add(new Option(state, state));
      if (result.states.includes(priorState)) stateFilter.value = priorState;
      renderRows(result.works);
      totalPages = result.total_pages;
      byId("pageLabel").textContent = `Page ${result.page} of ${totalPages}`;
      byId("previousPage").disabled = result.page <= 1;
      byId("nextPage").disabled = result.page >= totalPages;
      summary.textContent = `${result.total.toLocaleString()} works available in your authorized scope.`;
    } catch (error) {
      body.replaceChildren();
      const row = document.createElement("tr");
      const cell = cellText("td", error.message);
      cell.colSpan = 7;
      row.append(cell);
      body.append(row);
      summary.textContent = "Unable to load historical works.";
    }
  }

  async function start() {
    if (!authorityRoles.includes(session.role)) {
      window.location.replace("/");
      return;
    }
    const identityName = session.shortName || session.name || "Authority";
    byId("userName").textContent = identityName;
    byId("userRole").textContent = session.roleLabel || session.role.replaceAll("_", " ");
    byId("sidebarRole").textContent = byId("userRole").textContent;
    byId("userAvatar").textContent = identityName.charAt(0).toUpperCase();
    typeFilter.addEventListener("change", () => { page = 1; loadWorks(); });
    stateFilter.addEventListener("change", () => { page = 1; loadWorks(); });
    searchFilter.addEventListener("input", () => {
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(() => { page = 1; loadWorks(); }, 250);
    });
    byId("previousPage").addEventListener("click", () => { if (page > 1) { page -= 1; loadWorks(); } });
    byId("nextPage").addEventListener("click", () => { if (page < totalPages) { page += 1; loadWorks(); } });
    byId("closeMap").addEventListener("click", () => byId("mapDialog").close());
    byId("mapDialog").addEventListener("close", () => { byId("mapFrame").removeAttribute("src"); });
    byId("logoutBtn").addEventListener("click", async () => {
      try {
        await SahayogAuth.clearSession();
        window.location.replace("/");
      } catch (error) {
        window.alert(error.message);
      }
    });
    await loadWorks();
  }

  start();
})();
