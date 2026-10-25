(() => {
  const byId = (id) => document.getElementById(id);
  const datasetFilter = byId("datasetFilter");
  const stateFilter = byId("stateFilter");
  const searchFilter = byId("searchFilter");
  const head = byId("historyHead");
  const body = byId("historyBody");
  const status = byId("resultsStatus");
  const recordDialog = byId("recordDialog");
  const details = byId("recordDetails");
  const pageSize = 25;
  let page = 1;
  let totalPages = 1;
  let searchTimer;
  let requestController;

  function cell(tag, value) {
    const element = document.createElement(tag);
    element.textContent = value || "—";
    return element;
  }

  function amount(value) {
    if (!Number.isFinite(Number(value))) return "—";
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0
    }).format(Number(value));
  }

  function coordinateLocation(record) {
    const keys = Object.keys(record);
    const latitudeKey = keys.find((key) => /^(lat|latitude)$/i.test(key.trim()));
    const longitudeKey = keys.find((key) => /^(lon|lng|long|longitude)$/i.test(key.trim()));
    if (!latitudeKey || !longitudeKey) return null;
    if (!String(record[latitudeKey] || "").trim() || !String(record[longitudeKey] || "").trim()) return null;
    const latitude = Number(record[latitudeKey]);
    const longitude = Number(record[longitudeKey]);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
    return `${latitude},${longitude}`;
  }

  function locationQuery(record) {
    const coordinates = coordinateLocation(record);
    if (coordinates) return { query: coordinates, exact: true };
    const preferred = [
      "Work Description",
      "Location",
      "Village",
      "Block",
      "District",
      "Constituency",
      "State",
      "IDA"
    ];
    const values = preferred
      .map((key) => record[key])
      .filter((value) => value && String(value).trim());
    if (!values.length) {
      const fallback = Object.values(record).filter(Boolean).slice(0, 4);
      if (!fallback.length) return null;
      return { query: fallback.join(", "), exact: false };
    }
    return { query: [...new Set(values)].join(", "), exact: false };
  }

  function openMap(record) {
    const location = locationQuery(record);
    if (!location) return;
    const url = new URL("https://www.google.com/maps/search/");
    url.searchParams.set("api", "1");
    url.searchParams.set("query", location.query);
    window.open(url.href, "_blank", "noopener,noreferrer");
  }

  function showRecord(record, columns) {
    details.replaceChildren();
    byId("dialogTitle").textContent =
      record["Work Description"] || record["MP Name"] || record["Work ID"] || "Record details";
    for (const column of columns) {
      const term = cell("dt", column);
      const value = cell("dd", record[column]);
      details.append(term, value);
    }
    const location = locationQuery(record);
    const locationArea = byId("dialogLocation");
    locationArea.replaceChildren();
    if (location) {
      const note = cell(
        "p",
        location.exact
          ? "This source record contains coordinates."
          : "This source record has place text but no verified coordinates; this map search is approximate."
      );
      const link = cell("a", location.exact ? "Open exact map location" : "Search this place on a map");
      const url = new URL("https://www.google.com/maps/search/");
      url.searchParams.set("api", "1");
      url.searchParams.set("query", location.query);
      link.href = url.href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      locationArea.append(note, link);
    }
    recordDialog.showModal();
  }

  function render(records, columns) {
    const header = document.createElement("tr");
    for (const column of columns) header.append(cell("th", column));
    header.append(cell("th", "Details"));
    head.replaceChildren(header);
    body.replaceChildren();
    if (!records.length) {
      const row = document.createElement("tr");
      const empty = cell("td", "No records match these filters.");
      empty.colSpan = columns.length + 1;
      row.append(empty);
      body.append(row);
      return;
    }
    for (const record of records) {
      const row = document.createElement("tr");
      for (const column of columns) row.append(cell("td", record[column]));
      const actions = document.createElement("td");
      const actionGroup = document.createElement("div");
      actionGroup.className = "row-actions";
      const detailButton = cell("button", "Details");
      detailButton.type = "button";
      detailButton.addEventListener("click", () => showRecord(record, columns));
      actionGroup.append(detailButton);
      if (locationQuery(record)) {
        const mapButton = cell("button", "Map");
        mapButton.type = "button";
        mapButton.addEventListener("click", () => openMap(record));
        actionGroup.append(mapButton);
      }
      actions.append(actionGroup);
      row.append(actions);
      body.append(row);
    }
  }

  async function load() {
    if (requestController) requestController.abort();
    requestController = new AbortController();
    status.textContent = "Loading source records…";
    const params = new URLSearchParams({
      dataset: datasetFilter.value,
      state: stateFilter.value,
      search: searchFilter.value.trim(),
      page: String(page)
    });
    try {
      const response = await fetch(`/api/public/history?${params}`, {
        method: "GET",
        headers: { Accept: "application/json" },
        credentials: "omit",
        signal: requestController.signal
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Public history could not be loaded.");

      const previousState = stateFilter.value;
      stateFilter.replaceChildren(new Option("All states / UTs", ""));
      for (const state of result.states) stateFilter.add(new Option(state, state));
      if (result.states.includes(previousState)) stateFilter.value = previousState;

      render(result.records, result.columns);
      totalPages = result.total_pages;
      byId("pageLabel").textContent = `Page ${result.page} of ${totalPages}`;
      byId("previousPage").disabled = result.page <= 1;
      byId("nextPage").disabled = result.page >= totalPages;
      byId("recordMetric").textContent = result.total.toLocaleString("en-IN");
      byId("recordCaption").textContent = `${result.dataset.replaceAll("_", " ")} records`;
      byId("amountMetric").textContent = result.amount_column
        ? amount(result.amount_total)
        : "Not applicable";
      byId("amountCaption").textContent = result.amount_column
        ? `Sum of ${result.amount_column}`
        : "No amount column in this dataset";
      byId("stateMetric").textContent = result.states.length.toLocaleString("en-IN");
      status.textContent =
        `Showing ${result.records.length.toLocaleString("en-IN")} of ${result.total.toLocaleString("en-IN")} matching records · source dated ${result.as_of}.`;
    } catch (error) {
      if (error.name === "AbortError") return;
      head.replaceChildren();
      const row = document.createElement("tr");
      const message = cell("td", error.message);
      message.colSpan = 1;
      row.append(message);
      body.replaceChildren(row);
      status.textContent = "History is currently unavailable.";
    }
  }

  datasetFilter.addEventListener("change", () => {
    page = 1;
    stateFilter.value = "";
    load();
  });
  stateFilter.addEventListener("change", () => {
    page = 1;
    load();
  });
  searchFilter.addEventListener("input", () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      page = 1;
      load();
    }, 300);
  });
  byId("previousPage").addEventListener("click", () => {
    if (page > 1) {
      page -= 1;
      load();
    }
  });
  byId("nextPage").addEventListener("click", () => {
    if (page < totalPages) {
      page += 1;
      load();
    }
  });
  byId("closeDialog").addEventListener("click", () => recordDialog.close());
  recordDialog.addEventListener("click", (event) => {
    if (event.target === recordDialog) recordDialog.close();
  });
  load();
})();
