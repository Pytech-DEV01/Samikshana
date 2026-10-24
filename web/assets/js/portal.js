(function () {
  const session = SahayogAuth.requireSession();
  if (!session) return;

  const data = window.SahayogData;
  const role = SahayogAuth.ROLES[session.role];
  const pageLabels = {
    overview: "Overview",
    mps: "MPs & funds",
    contractors: "Contractors",
    works: "Works & payments",
    reports: "Reports & risk",
    locations: "Locations"
  };
  const pageSize = 12;
  const state = {
    view: "overview",
    mpPage: 0,
    contractorPage: 0,
    mpQuery: "",
    mpState: "",
    contractorQuery: "",
    locationQuery: ""
  };
  const money = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  });
  const indianNumber = new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 1
  });

  function byId(id) {
    return document.getElementById(id);
  }

  function formatMoney(amount) {
    return money.format(Number(amount) || 0);
  }

  function formatCompact(amount) {
    const value = Number(amount) || 0;
    if (Math.abs(value) >= 10000000) {
      return `₹${indianNumber.format(value / 10000000)} Cr`;
    }
    if (Math.abs(value) >= 100000) {
      return `₹${indianNumber.format(value / 100000)} L`;
    }
    return formatMoney(value);
  }

  function formatCount(value) {
    return new Intl.NumberFormat("en-IN").format(Number(value) || 0);
  }

  function formatPercent(value, digits) {
    return `${(Number(value) || 0).toFixed(digits === undefined ? 1 : digits)}%`;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function mapUrl(query) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  }

  function webSearchUrl(query) {
    return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  }

  function externalLink(label, href, className) {
    const link = el("a", className || "external-link", label);
    link.href = href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    return link;
  }

  function addEmptyRow(tbody, columns, text) {
    const row = el("tr");
    const cell = el("td", "empty-state", text);
    cell.colSpan = columns;
    row.append(cell);
    tbody.replaceChildren(row);
  }

  function metricCard(label, value, note, symbol) {
    const card = el("article", "metric");
    const labelRow = el("div", "metric-label");
    labelRow.append(el("span", "", label), el("span", "metric-icon", symbol));
    card.append(
      labelRow,
      el("p", "metric-value", value),
      el("p", "metric-note", note)
    );
    return card;
  }

  function putMetrics(targetId, items) {
    const target = byId(targetId);
    target.replaceChildren(
      ...items.map((item) =>
        metricCard(item.label, item.value, item.note, item.symbol)
      )
    );
  }

  function riskFor(mp) {
    const flags = [];
    if (mp.recommendedWorks >= 10 && mp.completionRate < 25) {
      flags.push("Low completion");
    }
    if (
      mp.transactions >= 5 &&
      mp.pendingPayments / mp.transactions > 0.1
    ) {
      flags.push("Pending payments");
    }
    if (
      mp.recommendedWorks >= 10 &&
      mp.recommended > 0 &&
      mp.spent / mp.recommended < 0.4
    ) {
      flags.push("Low expenditure");
    }
    return {
      flags,
      level: flags.length >= 2 ? "Review" : flags.length === 1 ? "Watch" : "Standard"
    };
  }

  function badge(level) {
    const className =
      level === "Review"
        ? "risk-review"
        : level === "Watch"
          ? "risk-watch"
          : "risk-standard";
    return el("span", `risk-badge ${className}`, level);
  }

  function showView(view) {
    if (!pageLabels[view]) return;
    state.view = view;
    document.querySelectorAll(".menu-link").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.view === view);
    });
    document.querySelectorAll(".view-panel").forEach((panel) => {
      panel.classList.toggle("is-visible", panel.id === `view-${view}`);
    });
    byId("pageLabel").textContent = pageLabels[view];
    byId("sidebar").classList.remove("is-open");
    if (view === "overview" || view === "works" || view === "reports") {
      renderCharts(view);
    }
  }

  function renderOverview() {
    const totals = data.totals;
    byId("snapshotDate").textContent = data.asOf;
    byId("snapshotDateHeading").textContent = data.asOf;
    putMetrics("overviewMetrics", [
      {
        label: "MPs covered",
        value: formatCount(totals.mps),
        note: "Across the supplied MP summary",
        symbol: "♙"
      },
      {
        label: "Funds allocated",
        value: formatCompact(totals.allocated),
        note: "MP summary reported allocation",
        symbol: "₹"
      },
      {
        label: "Works completed",
        value: formatCount(totals.completedWorks),
        note: `${formatCompact(totals.completedValue)} recorded final amount`,
        symbol: "✓"
      },
      {
        label: "Expenditure records",
        value: formatCount(totals.expenditureTransactions),
        note: `${formatCompact(totals.expenditure)} transaction export total`,
        symbol: "↗"
      }
    ]);
    renderPaymentLegend();
  }

  function renderPaymentLegend() {
    const total = data.totals.paymentSuccess + data.totals.paymentInProgress;
    const legend = byId("paymentLegend");
    const items = [
      ["Paid", data.totals.paymentSuccess, "#21845b"],
      ["In progress", data.totals.paymentInProgress, "#e2a14a"]
    ];
    legend.replaceChildren(
      ...items.map(([label, amount, color]) => {
        const item = el("span", "legend-item");
        const dot = el("span", "legend-dot");
        dot.style.backgroundColor = color;
        item.append(dot, document.createTextNode(`${label}: ${formatCount(amount)}`));
        return item;
      })
    );
    legend.setAttribute("aria-label", `Payment records: ${formatCount(total)} total`);
  }

  function chartFor(id, option) {
    const container = byId(id);
    if (!window.echarts) {
      container.replaceChildren(
        el("div", "empty-state", "Charts need an internet connection to load Apache ECharts.")
      );
      return;
    }
    const chart = window.echarts.getInstanceByDom(container) || window.echarts.init(container);
    chart.setOption(option, true);
    chart.resize();
  }

  function renderCharts(view) {
    const colors = ["#21845b", "#e2a14a", "#477eb7", "#bd5b52"];
    if (view === "overview") {
      const trend = data.trend.slice(-24);
      chartFor("activityChart", {
        color: colors,
        tooltip: { trigger: "axis" },
        legend: { bottom: 0, textStyle: { color: "#7d8998", fontSize: 10 } },
        grid: { left: 58, right: 18, top: 20, bottom: 48 },
        xAxis: {
          type: "category",
          data: trend.map((item) => item.month),
          axisLabel: { color: "#8591a1", fontSize: 9, rotate: 25 },
          axisLine: { lineStyle: { color: "#e4e9ef" } }
        },
        yAxis: {
          type: "value",
          axisLabel: { color: "#8591a1", fontSize: 9 },
          splitLine: { lineStyle: { color: "#edf0f4" } }
        },
        series: [
          {
            name: "Recommended",
            type: "line",
            smooth: true,
            showSymbol: false,
            data: trend.map((item) => item.recommendedCount),
            areaStyle: { opacity: 0.08 }
          },
          {
            name: "Completed",
            type: "line",
            smooth: true,
            showSymbol: false,
            data: trend.map((item) => item.completedCount),
            areaStyle: { opacity: 0.06 }
          }
        ]
      });
      const mpTop = [...data.mps].sort((a, b) => b.spent - a.spent).slice(0, 10).reverse();
      chartFor("mpChart", {
        color: ["#21845b"],
        tooltip: { trigger: "axis", valueFormatter: formatMoney },
        grid: { left: 150, right: 32, top: 10, bottom: 15 },
        xAxis: {
          type: "value",
          axisLabel: { color: "#8591a1", fontSize: 9, formatter: formatCompact },
          splitLine: { lineStyle: { color: "#edf0f4" } }
        },
        yAxis: {
          type: "category",
          data: mpTop.map((mp) => mp.seat),
          axisLabel: { color: "#647185", fontSize: 9, width: 125, overflow: "truncate" },
          axisLine: { show: false },
          axisTick: { show: false }
        },
        series: [
          {
            name: "MP summary expenditure",
            type: "bar",
            barMaxWidth: 15,
            data: mpTop.map((mp) => mp.spent),
            itemStyle: { borderRadius: [0, 4, 4, 0] }
          }
        ]
      });
      const paymentValues = [
        { value: data.totals.paymentSuccess, name: "Payment success" },
        { value: data.totals.paymentInProgress, name: "Payment in progress" }
      ];
      chartFor("paymentChart", {
        color: ["#21845b", "#e2a14a"],
        tooltip: { trigger: "item", formatter: "{b}<br>{c} records ({d}%)" },
        series: [
          {
            type: "pie",
            radius: ["54%", "77%"],
            center: ["50%", "48%"],
            avoidLabelOverlap: true,
            label: { show: false },
            data: paymentValues
          }
        ]
      });
    }
    if (view === "works") {
      chartFor("pipelineChart", {
        color: ["#477eb7", "#21845b"],
        tooltip: { trigger: "axis" },
        grid: { left: 72, right: 20, top: 18, bottom: 28 },
        xAxis: { type: "value", axisLabel: { color: "#8591a1", fontSize: 9 }, splitLine: { lineStyle: { color: "#edf0f4" } } },
        yAxis: { type: "category", data: ["Work records"], axisLabel: { color: "#647185", fontSize: 10 } },
        series: [
          { name: "Recommended", type: "bar", data: [data.totals.recommendedWorks], barMaxWidth: 22 },
          { name: "Completed", type: "bar", data: [data.totals.completedWorks], barMaxWidth: 22 }
        ]
      });
      chartFor("amountChart", {
        color: ["#477eb7", "#e2a14a", "#21845b"],
        tooltip: { trigger: "axis", valueFormatter: formatMoney },
        grid: { left: 90, right: 20, top: 18, bottom: 24 },
        xAxis: { type: "value", axisLabel: { color: "#8591a1", fontSize: 9, formatter: formatCompact }, splitLine: { lineStyle: { color: "#edf0f4" } } },
        yAxis: { type: "category", data: ["MP summary expenditure", "MP summary recommended", "Transaction export"], axisLabel: { color: "#647185", fontSize: 9 } },
        series: [
          { type: "bar", data: [data.totals.mpExpenditure, data.totals.mpRecommended, data.totals.expenditure], barMaxWidth: 19, itemStyle: { borderRadius: [0, 4, 4, 0] } }
        ]
      });
    }
    if (view === "reports") {
      const trend = data.trend.slice(-24);
      chartFor("paymentTimelineChart", {
        color: ["#21845b", "#e2a14a"],
        tooltip: { trigger: "axis" },
        legend: { bottom: 0, textStyle: { color: "#7d8998", fontSize: 10 } },
        grid: { left: 45, right: 15, top: 18, bottom: 48 },
        xAxis: { type: "category", data: trend.map((item) => item.month), axisLabel: { color: "#8591a1", fontSize: 9, rotate: 25 }, axisLine: { lineStyle: { color: "#e4e9ef" } } },
        yAxis: { type: "value", axisLabel: { color: "#8591a1", fontSize: 9 }, splitLine: { lineStyle: { color: "#edf0f4" } } },
        series: [
          { name: "Success", type: "line", smooth: true, showSymbol: false, data: trend.map((item) => item.successfulPayments) },
          { name: "In progress", type: "line", smooth: true, showSymbol: false, data: trend.map((item) => item.inProgressPayments) }
        ]
      });
    }
  }

  function setCell(row, text, className) {
    const cell = el("td", className || "", text);
    row.append(cell);
    return cell;
  }

  function addMainSecondary(cell, primary, secondary) {
    cell.replaceChildren(el("span", "primary-cell", primary), el("span", "secondary-cell", secondary));
  }

  function getFilteredMps() {
    const query = state.mpQuery.trim().toLocaleLowerCase();
    return data.mps.filter((mp) => {
      const matchesText =
        !query ||
        `${mp.name} ${mp.seat} ${mp.state} ${mp.house}`.toLocaleLowerCase().includes(query);
      return matchesText && (!state.mpState || mp.state === state.mpState);
    });
  }

  function renderMps() {
    const totals = data.totals;
    const notRecommended = totals.allocated - totals.mpRecommended;
    putMetrics("mpMetrics", [
      {
        label: "MP allocation",
        value: formatCompact(totals.allocated),
        note: "Total reported allocation",
        symbol: "₹"
      },
      {
        label: "Recommended amount",
        value: formatCompact(totals.mpRecommended),
        note: "Amount reported in MP summary",
        symbol: "↗"
      },
      {
        label: "MP summary expenditure",
        value: formatCompact(totals.mpExpenditure),
        note: "Summary export total",
        symbol: "✓"
      },
      {
        label: "Allocation not recommended",
        value: formatCompact(notRecommended),
        note: "Allocation minus recommended amount",
        symbol: "◷"
      }
    ]);
    const list = getFilteredMps();
    const pages = Math.max(1, Math.ceil(list.length / pageSize));
    state.mpPage = Math.min(state.mpPage, pages - 1);
    const pageRows = list.slice(state.mpPage * pageSize, (state.mpPage + 1) * pageSize);
    const tbody = byId("mpTable");
    if (!pageRows.length) {
      addEmptyRow(tbody, 9, "No MPs match this search.");
    } else {
      tbody.replaceChildren(
        ...pageRows.map((mp) => {
          const row = el("tr");
          const identity = el("td");
          addMainSecondary(identity, mp.name, mp.seat);
          row.append(identity);
          setCell(row, `${mp.state} · ${mp.house}`);
          setCell(row, formatCompact(mp.allocated), "amount-cell");
          setCell(row, formatCompact(mp.recommended), "amount-cell");
          setCell(row, formatCompact(mp.spent), "amount-cell");
          setCell(row, formatCount(mp.completed));
          setCell(row, formatPercent(mp.completionRate));
          const riskCell = el("td");
          riskCell.append(badge(riskFor(mp).level));
          row.append(riskCell);
          const action = el("td");
          const button = el("button", "link-button", "Details");
          button.type = "button";
          button.addEventListener("click", () => openMpProfile(mp));
          action.append(button);
          row.append(action);
          return row;
        })
      );
    }
    byId("mpCount").textContent = `${formatCount(list.length)} MPs`;
    renderPagination("mpPagination", state.mpPage, pages, (page) => {
      state.mpPage = page;
      renderMps();
    });
  }

  function getFilteredContractors() {
    const query = state.contractorQuery.trim().toLocaleLowerCase();
    if (!query) return data.contractors;
    return data.contractors.filter((vendor) =>
      `${vendor.name} ${vendor.states.join(" ")} ${vendor.seats.join(" ")} ${vendor.mps.join(" ")} ${vendor.idas.join(" ")}`
        .toLocaleLowerCase()
        .includes(query)
    );
  }

  function renderContractors() {
    const list = getFilteredContractors();
    const pages = Math.max(1, Math.ceil(list.length / pageSize));
    state.contractorPage = Math.min(state.contractorPage, pages - 1);
    const pageRows = list.slice(
      state.contractorPage * pageSize,
      (state.contractorPage + 1) * pageSize
    );
    const tbody = byId("contractorTable");
    if (!pageRows.length) {
      addEmptyRow(tbody, 7, "No contractors match this search.");
    } else {
      tbody.replaceChildren(
        ...pageRows.map((vendor) => {
          const row = el("tr");
          const identity = el("td");
          addMainSecondary(
            identity,
            vendor.name,
            vendor.mps.slice(0, 2).join(", ") || "MP not reported"
          );
          row.append(identity);
          setCell(row, formatCount(vendor.count));
          setCell(row, formatCompact(vendor.amount), "amount-cell");
          setCell(row, formatCount(vendor.success));
          setCell(row, formatCount(vendor.inProgress));
          setCell(
            row,
            [vendor.seats[0], vendor.states[0]].filter(Boolean).join(", ") ||
              "Not reported"
          );
          const action = el("td");
          const button = el("button", "link-button", "Details");
          button.type = "button";
          button.addEventListener("click", () => openContractorProfile(vendor));
          action.append(button);
          row.append(action);
          return row;
        })
      );
    }
    byId("contractorCount").textContent = `${formatCount(list.length)} vendors`;
    renderPagination("contractorPagination", state.contractorPage, pages, (page) => {
      state.contractorPage = page;
      renderContractors();
    });
  }

  function renderPagination(targetId, currentPage, pageCount, onPage) {
    const pagination = byId(targetId);
    const previous = el("button", "", "←");
    previous.type = "button";
    previous.disabled = currentPage === 0;
    previous.setAttribute("aria-label", "Previous page");
    previous.addEventListener("click", () => onPage(currentPage - 1));
    const next = el("button", "", "→");
    next.type = "button";
    next.disabled = currentPage >= pageCount - 1;
    next.setAttribute("aria-label", "Next page");
    next.addEventListener("click", () => onPage(currentPage + 1));
    pagination.replaceChildren(
      previous,
      el("span", "", `Page ${currentPage + 1} of ${pageCount}`),
      next
    );
  }

  function profileField(label, value) {
    const field = el("div", "profile-field");
    field.append(el("span", "", label), el("strong", "", value));
    return field;
  }

  function openProfile(eyebrow, title, description, fields, links) {
    byId("dialogEyebrow").textContent = eyebrow;
    byId("dialogTitle").textContent = title;
    const body = el("div", "profile-body");
    body.append(el("p", "profile-description", description));
    const grid = el("div", "profile-grid");
    fields.forEach(([label, value]) => grid.append(profileField(label, String(value))));
    body.append(grid);
    const linkRow = el("div", "profile-links");
    links.forEach(({ label, href }) =>
      linkRow.append(externalLink(label, href, "external-link"))
    );
    body.append(linkRow);
    byId("dialogContent").replaceChildren(body);
    byId("profileDialog").showModal();
  }

  function openMpProfile(mp) {
    const risk = riskFor(mp);
    const location = `${mp.seat}, ${mp.state}`;
    openProfile(
      `${mp.house} · MP SUMMARY`,
      mp.name,
      `${mp.seat}, ${mp.state}. Summary figures are from the MP export dated ${data.asOf}.`,
      [
        ["Constituency", mp.seat],
        ["State", mp.state],
        ["House", mp.house],
        ["Funds allocated", formatMoney(mp.allocated)],
        ["Amount recommended", formatMoney(mp.recommended)],
        ["Allocation not recommended", formatMoney(mp.allocated - mp.recommended)],
        ["Source-reported utilization", formatPercent(mp.utilization)],
        ["MP summary expenditure", formatMoney(mp.spent)],
        ["Works completed", formatCount(mp.completed)],
        ["Works recommended", formatCount(mp.recommendedWorks)],
        ["Completion rate", formatPercent(mp.completionRate)],
        ["Vendor balance not yet paid", formatMoney(mp.vendorBalance)],
        ["Transactions", formatCount(mp.transactions)],
        ["Successful / pending payments", `${formatCount(mp.successfulPayments)} / ${formatCount(mp.pendingPayments)}`],
        ["Review indicators", risk.flags.join(", ") || "No indicators triggered"],
        ["Average rating", mp.rating || "Not reported"]
      ],
      [
        { label: "Search MP details ↗", href: webSearchUrl(`${mp.name} MP ${mp.seat}`) },
        { label: "Search constituency map ↗", href: mapUrl(location) }
      ]
    );
  }

  function openContractorProfile(vendor) {
    const reportedLocation = [...vendor.seats, ...vendor.states].join(", ");
    const locationQuery = reportedLocation || vendor.idas[0] || "India";
    openProfile(
      "VENDOR · EXPENDITURE EXPORT",
      vendor.name,
      `Aggregated from ${formatCount(vendor.count)} expenditure records. The source does not verify vendor legal identity or ownership.`,
      [
        ["Expenditure records", formatCount(vendor.count)],
        ["Recorded expenditure", formatMoney(vendor.amount)],
        ["Payment success records", formatCount(vendor.success)],
        ["Payment in-progress records", formatCount(vendor.inProgress)],
        ["Reported states", vendor.states.join(", ") || "Not reported"],
        ["Reported constituencies", vendor.seats.join(", ") || "Not reported"],
        ["Linked MP names", vendor.mps.join(", ") || "Not reported"],
        ["Implementing agencies", vendor.idas.join("; ") || "Not reported"]
      ],
      [
        { label: "Search contractor details ↗", href: webSearchUrl(vendor.name) },
        { label: "Search reported location ↗", href: mapUrl(locationQuery) }
      ]
    );
  }

  function renderWorks() {
    const totals = data.totals;
    const summaryProgress =
      totals.mpRecommended > 0 ? totals.mpExpenditure / totals.mpRecommended * 100 : 0;
    putMetrics("worksMetrics", [
      {
        label: "Recommended works",
        value: formatCount(totals.recommendedWorks),
        note: `${formatCompact(totals.recommendedValue)} recommended-work export total`,
        symbol: "＋"
      },
      {
        label: "Completed works",
        value: formatCount(totals.completedWorks),
        note: `${formatCompact(totals.completedValue)} completed-work export total`,
        symbol: "✓"
      },
      {
        label: "Payments in progress",
        value: formatCount(totals.paymentInProgress),
        note: "Expenditure transaction records",
        symbol: "◷"
      },
      {
        label: "MP summary spend ratio",
        value: formatPercent(summaryProgress),
        note: "Summary expenditure ÷ summary recommended",
        symbol: "↗"
      }
    ]);
  }

  function flaggedMps() {
    return data.mps
      .map((mp) => ({ mp, risk: riskFor(mp) }))
      .filter((item) => item.risk.flags.length)
      .sort(
        (a, b) =>
          b.risk.flags.length - a.risk.flags.length ||
          b.mp.pendingPayments - a.mp.pendingPayments ||
          a.mp.completionRate - b.mp.completionRate
      );
  }

  function renderReports() {
    const flagged = flaggedMps();
    const reviewCount = flagged.filter((item) => item.risk.level === "Review").length;
    const watchCount = flagged.filter((item) => item.risk.level === "Watch").length;
    putMetrics("riskMetrics", [
      {
        label: "MPs flagged for review",
        value: formatCount(reviewCount),
        note: "Two or more indicators",
        symbol: "!"
      },
      {
        label: "MPs to watch",
        value: formatCount(watchCount),
        note: "One indicator",
        symbol: "◉"
      },
      {
        label: "In-progress payments",
        value: formatCount(data.totals.paymentInProgress),
        note: `Across ${formatCount(data.totals.expenditureTransactions)} records`,
        symbol: "◷"
      }
    ]);
    const tbody = byId("riskTable");
    if (!flagged.length) {
      addEmptyRow(tbody, 7, "No records meet these review thresholds.");
      return;
    }
    tbody.replaceChildren(
      ...flagged.slice(0, 100).map(({ mp, risk }) => {
        const row = el("tr");
        const identity = el("td");
        addMainSecondary(identity, mp.name, mp.seat);
        row.append(identity);
        setCell(row, formatPercent(mp.completionRate));
        setCell(
          row,
          `${formatPercent(mp.recommended ? mp.spent / mp.recommended * 100 : 0)} · ${formatMoney(mp.spent)}`
        );
        setCell(
          row,
          `${formatCount(mp.pendingPayments)} / ${formatCount(mp.transactions)}`
        );
        setCell(row, risk.flags.join(" · "));
        const level = el("td");
        level.append(badge(risk.level));
        row.append(level);
        const action = el("td");
        const button = el("button", "link-button", "Details");
        button.type = "button";
        button.addEventListener("click", () => openMpProfile(mp));
        action.append(button);
        row.append(action);
        return row;
      })
    );
  }

  function renderLocations() {
    const query = state.locationQuery.trim().toLocaleLowerCase();
    const list = data.states.filter((item) =>
      !query || item.state.toLocaleLowerCase().includes(query)
    );
    byId("locationCount").textContent = `${formatCount(list.length)} locations`;
    const grid = byId("locationGrid");
    grid.replaceChildren(
      ...list.map((item) => {
        const card = el("article", "location-card");
        const top = el("div", "location-top");
        top.append(el("h2", "", item.state));
        top.append(externalLink("Map ↗", mapUrl(item.state), "map-link"));
        const numbers = el("div", "location-numbers");
        const fields = [
          ["MPs", item.mps || 0],
          ["Completed works", item.completedWorks || 0],
          ["Recommended works", item.recommendedWorks || 0],
          ["Expenditure records", item.expenditureRows || 0]
        ];
        fields.forEach(([label, value]) => {
          const metric = el("div");
          metric.append(el("span", "", label), el("strong", "", formatCount(value)));
          numbers.append(metric);
        });
        const foot = el("p", "state-meta", `MP allocation reported: ${formatCompact(item.allocated || 0)}`);
        card.append(top, numbers, foot);
        return card;
      })
    );
    if (!list.length) {
      grid.append(el("div", "empty-state", "No states match this search."));
    }
  }

  function initFilters() {
    const states = [...new Set(data.mps.map((mp) => mp.state))].sort((a, b) =>
      a.localeCompare(b)
    );
    byId("mpStateFilter").append(
      ...states.map((name) => {
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        return option;
      })
    );
    byId("mpSearch").addEventListener("input", (event) => {
      state.mpQuery = event.target.value;
      state.mpPage = 0;
      renderMps();
    });
    byId("mpStateFilter").addEventListener("change", (event) => {
      state.mpState = event.target.value;
      state.mpPage = 0;
      renderMps();
    });
    byId("contractorSearch").addEventListener("input", (event) => {
      state.contractorQuery = event.target.value;
      state.contractorPage = 0;
      renderContractors();
    });
    byId("locationSearch").addEventListener("input", (event) => {
      state.locationQuery = event.target.value;
      renderLocations();
    });
  }

  function initMenu() {
    document.querySelectorAll(".menu-link").forEach((button) =>
      button.addEventListener("click", () => showView(button.dataset.view))
    );
    document.querySelectorAll("[data-open-view]").forEach((button) =>
      button.addEventListener("click", () => showView(button.dataset.openView))
    );
    byId("menuToggle").addEventListener("click", () =>
      byId("sidebar").classList.toggle("is-open")
    );
    document.addEventListener("click", (event) => {
      if (
        window.innerWidth <= 760 &&
        byId("sidebar").classList.contains("is-open") &&
        !byId("sidebar").contains(event.target) &&
        !byId("menuToggle").contains(event.target)
      ) {
        byId("sidebar").classList.remove("is-open");
      }
    });
    byId("logoutBtn").addEventListener("click", async () => {
      try {
        await SahayogAuth.clearSession();
        window.location.replace("/");
      } catch (error) {
        window.alert(error.message);
      }
    });
    byId("dialogClose").addEventListener("click", () => byId("profileDialog").close());
    byId("profileDialog").addEventListener("click", (event) => {
      if (event.target === byId("profileDialog")) byId("profileDialog").close();
    });
    window.addEventListener("resize", () => {
      if (window.echarts) window.echarts.getInstanceByDom && document.querySelectorAll(".chart").forEach((container) => {
        const chart = window.echarts.getInstanceByDom(container);
        if (chart) chart.resize();
      });
    });
  }

  function start() {
    if (!data || !Array.isArray(data.mps) || !Array.isArray(data.contractors)) {
      document.querySelector(".content").replaceChildren(
        el("div", "empty-state", "Dashboard data did not load. Refresh the page or rebuild the dashboard data asset.")
      );
      return;
    }
    byId("userName").textContent = session.shortName || role.shortName;
    byId("userRole").textContent = role.label;
    byId("userAvatar").textContent = (session.shortName || role.shortName).charAt(0).toUpperCase();
    initMenu();
    initFilters();
    renderOverview();
    renderMps();
    renderContractors();
    renderWorks();
    renderReports();
    renderLocations();
    showView("overview");
  }

  start();
})();
