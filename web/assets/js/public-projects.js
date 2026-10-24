(() => {
  const rows = document.getElementById("projectRows");
  const count = document.getElementById("resultCount");
  const search = document.getElementById("projectSearch");
  let projects = [];

  function addCell(row, value) {
    const cell = document.createElement("td");
    cell.textContent = value || "—";
    row.append(cell);
  }

  function formatDate(value) {
    if (!value) return "—";
    return new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC"
    }).format(new Date(`${value}T00:00:00Z`));
  }

  function render() {
    const term = search.value.trim().toLocaleLowerCase();
    const visible = projects.filter((project) =>
      [
        project.title,
        project.mp_name,
        project.constituency,
        project.district,
        project.state
      ].some((field) => String(field || "").toLocaleLowerCase().includes(term))
    );
    rows.replaceChildren();
    if (!visible.length) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 6;
      cell.textContent = "No public project summaries match your search.";
      row.append(cell);
      rows.append(row);
    } else {
      visible.forEach((project) => {
        const row = document.createElement("tr");
        addCell(row, project.title);
        addCell(row, [project.mp_name, project.constituency].filter(Boolean).join(" · "));
        addCell(row, [project.district, project.state].filter(Boolean).join(", "));
        addCell(row, project.sanctioned_amount == null
          ? "—"
          : new Intl.NumberFormat("en-IN", {
            style: "currency",
            currency: "INR",
            maximumFractionDigits: 0
          }).format(project.sanctioned_amount));
        addCell(row, `${formatDate(project.start_date)} – ${formatDate(project.end_date)}`);
        addCell(row, project.verified_completion_percent == null
          ? "No verified progress published"
          : `${Number(project.verified_completion_percent).toFixed(1)}% · ${formatDate(project.last_update_date)}`);
        rows.append(row);
      });
    }
    count.textContent = `${visible.length.toLocaleString()} of ${projects.length.toLocaleString()} public project summaries`;
  }

  async function load() {
    try {
      const response = await fetch("/api/public/projects", {
        method: "GET",
        headers: { Accept: "application/json" },
        credentials: "omit"
      });
      if (!response.ok) throw new Error("Public project summaries could not be loaded.");
      const result = await response.json();
      projects = Array.isArray(result.projects) ? result.projects : [];
      render();
    } catch (error) {
      rows.replaceChildren();
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 6;
      cell.textContent = error.message;
      row.append(cell);
      rows.append(row);
      count.textContent = "Project summaries are currently unavailable.";
    }
  }

  search.addEventListener("input", render);
  load();
})();
