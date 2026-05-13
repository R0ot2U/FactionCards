/* Landing page — faction table + bar charts */

let allFactions = [];
let currentEventType = getEventType();
let currentWindow = getWindow();
let currentSortCol = 2;  // Default to play_rate column (0=faction, 1=lists, 2=play_rate)
let currentSortDir = -1; // -1 = desc, 1 = asc
let manifest = {};

async function loadData(eventType, window) {
  const root = dataRoot(eventType, window);
  try {
    manifest = await fetchJSON(`${root}/index.json`);
    const factions = await fetchJSON(`${root}/factions.json`);
    allFactions = factions;
    return true;
  } catch (e) {
    // Fall back to "all" / "30d" bundle if requested bundle is unavailable
    if (eventType !== "all" || window !== "30d") {
      try {
        manifest = await fetchJSON(`${dataRoot("all", "30d")}/index.json`);
        const factions = await fetchJSON(`${dataRoot("all", "30d")}/factions.json`);
        allFactions = factions;
        currentEventType = "all";
        currentWindow = "30d";
        // Sync button active state to fallback
        document.querySelectorAll("#event-type-btns .btn").forEach(b => {
          b.classList.toggle("active", b.dataset.val === "all");
        });
        document.querySelectorAll("#window-btns .btn").forEach(b => {
          b.classList.toggle("active", b.dataset.val === "30d");
        });
        return true;
      } catch (_) {}
    }
    document.getElementById("faction-tbody").innerHTML =
      `<tr><td colspan="6" class="loading error-state">
        Failed to load data: ${e.message}
        <button class="btn retry-btn" onclick="init()">Retry</button>
      </td></tr>`;
    return false;
  }
}

async function init() {
  // Show loading state
  document.getElementById("faction-tbody").innerHTML =
    `<tr><td colspan="6" class="loading">Loading data…</td></tr>`;

  const ok = await loadData(currentEventType, currentWindow);
  if (!ok) return;

  // Header meta
  document.getElementById("window-label").textContent =
    `${manifest.window_days}-day window · as of ${manifest.as_of}`;
  document.getElementById("build-info").textContent =
    `${manifest.total_lists.toLocaleString()} lists · ${manifest.total_games.toLocaleString()} games`;

  // PNG Cards link from manifest
  const cardsLink = document.getElementById("cards-link");
  if (cardsLink) cardsLink.href = manifest.cards_url || "https://r0ot2u.github.io/FactionCards/";

  // Sync active buttons to current state
  document.querySelectorAll("#event-type-btns .btn").forEach(b => {
    b.classList.toggle("active", b.dataset.val === currentEventType);
  });
  document.querySelectorAll("#window-btns .btn").forEach(b => {
    b.classList.toggle("active", b.dataset.val === currentWindow);
  });

  renderTable();
  renderCharts();
  renderFooter(manifest);

  // Set up column sorting
  setupColumnSorting();

  // Search
  document.getElementById("search").addEventListener("input", () => renderTable());

  // Window buttons — fetch new bundle and re-render
  document.querySelectorAll("#window-btns .btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const newWindow = btn.dataset.val;
      if (newWindow === currentWindow) return;

      document.querySelectorAll("#window-btns .btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentWindow = newWindow;

      // Update URL without reload so the state is shareable/bookmarkable
      const url = new URL(window.location);
      url.searchParams.set("window", newWindow);
      history.replaceState(null, "", url);

      await loadData(currentEventType, currentWindow);
      renderTable();
      renderCharts();
      renderFooter(manifest);

      // Update header stats
      document.getElementById("window-label").textContent =
        `${manifest.window_days}-day window · as of ${manifest.as_of}`;
      document.getElementById("build-info").textContent =
        `${manifest.total_lists.toLocaleString()} lists · ${manifest.total_games.toLocaleString()} games`;
    });
  });

  // Event-type buttons — fetch new bundle and re-render
  document.querySelectorAll("#event-type-btns .btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const newType = btn.dataset.val;
      if (newType === currentEventType) return;

      document.querySelectorAll("#event-type-btns .btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentEventType = newType;

      // Update URL without reload so the state is shareable/bookmarkable
      const url = new URL(window.location);
      url.searchParams.set("event_type", newType);
      history.replaceState(null, "", url);

      await loadData(currentEventType, currentWindow);
      renderTable();
      renderCharts();
      renderFooter(manifest);

      // Update header stats
      document.getElementById("window-label").textContent =
        `${manifest.window_days}-day window · as of ${manifest.as_of}`;
      document.getElementById("build-info").textContent =
        `${manifest.total_lists.toLocaleString()} lists · ${manifest.total_games.toLocaleString()} games`;
    });
  });
}

function filteredFactions() {
  const q = (document.getElementById("search").value || "").toLowerCase().trim();
  let rows = allFactions;
  if (q) rows = rows.filter(r => r.faction.toLowerCase().includes(q));
  return sortRowsByColumn(rows);
}

function sortRowsByColumn(rows) {
  const colMap = ["faction", "lists", "play_rate", "win_rate", "trend_delta", "top_detachment"];
  const sortKey = colMap[currentSortCol] || "play_rate";

  return [...rows].sort((a, b) => {
    if (sortKey === "faction" || sortKey === "top_detachment") {
      return (a[sortKey] || "").localeCompare(b[sortKey] || "") * currentSortDir;
    }
    return ((b[sortKey] ?? -999) - (a[sortKey] ?? -999)) * -currentSortDir;
  });
}

function setupColumnSorting() {
  const table = document.getElementById("faction-table");
  const headers = table.querySelectorAll("thead th");

  headers.forEach((th, colIdx) => {
    th.style.cursor = "pointer";
    th.addEventListener("click", () => {
      if (currentSortCol === colIdx) {
        currentSortDir = -currentSortDir;
      } else {
        currentSortCol = colIdx;
        currentSortDir = -1; // Default to descending (except faction which sorts asc)
        if (colIdx === 0) currentSortDir = 1; // Faction name defaults to asc
      }

      // Update header indicators
      headers.forEach(h => h.classList.remove("sort-asc", "sort-desc"));
      th.classList.add(currentSortDir === 1 ? "sort-asc" : "sort-desc");

      renderTable();
      renderCharts();
    });
  });

  // Set initial indicator
  headers[currentSortCol]?.classList.add("sort-desc");
}

function factionHref(slug) {
  const url = new URL("faction.html", window.location.href);
  url.searchParams.set("faction", slug);
  url.searchParams.set("event_type", currentEventType);
  url.searchParams.set("window", currentWindow);
  return url.pathname + url.search;
}

function renderTable() {
  const rows = filteredFactions();
  document.getElementById("row-count").textContent = `${rows.length} factions`;

  const tbody = document.getElementById("faction-tbody");
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty">No factions match.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(r => {
    const wrCls = wrClass(r.win_rate);
    const slug = r.slug || factionSlug(r.faction);
    return `
      <tr>
        <td><a class="faction-link" href="${factionHref(slug)}">${r.faction}</a></td>
        <td data-sort="${r.lists}">${r.lists.toLocaleString()}</td>
        <td data-sort="${r.play_rate}" title="Share of all lists in the window playing this faction">${r.play_rate.toFixed(1)}%</td>
        <td data-sort="${r.win_rate}" title="Win rate across all games in the window (draw = 0.5 win)">${'<span class="' + wrCls + '">' + r.win_rate.toFixed(1) + '%</span>'}</td>
        <td data-sort="${r.trend_delta ?? -999}" title="Win-rate change vs the previous ${manifest.window_days}-day window">${trendHtml(r.trend_delta)}</td>
        <td style="color:var(--dim);font-size:0.8rem">${r.top_detachment || "—"}</td>
      </tr>`;
  }).join("");

  // Restore sort indicator
  const headers = document.querySelectorAll("#faction-table thead th");
  headers.forEach((h, i) => {
    h.classList.remove("sort-asc", "sort-desc");
    if (i === currentSortCol) {
      h.classList.add(currentSortDir === 1 ? "sort-asc" : "sort-desc");
    }
  });
}

function renderCharts() {
  if (typeof Plotly === "undefined") return;
  const rows = filteredFactions();
  if (!rows.length) return;

  // Play rate bar — sorted by play rate desc
  const playRows = [...rows].sort((a, b) => b.play_rate - a.play_rate).slice(0, 28);
  Plotly.newPlot("chart-play", [{
    type: "bar",
    orientation: "h",
    y: playRows.map(r => r.faction).reverse(),
    x: playRows.map(r => r.play_rate).reverse(),
    marker: { color: "#1565c0" },
    text: playRows.map(r => `${r.play_rate.toFixed(1)}%`).reverse(),
    textposition: "outside",
    cliponaxis: false,
    hovertemplate: "%{y}: %{x:.1f}%<extra></extra>",
  }], darkLayout({ margin: { t: 20, r: 80, b: 30, l: 180 } }), { responsive: true });

  // Win rate bar — sorted by win rate desc
  const wrRows = [...rows].sort((a, b) => b.win_rate - a.win_rate).slice(0, 28);
  Plotly.newPlot("chart-wr", [{
    type: "bar",
    orientation: "h",
    y: wrRows.map(r => r.faction).reverse(),
    x: wrRows.map(r => r.win_rate).reverse(),
    marker: { color: wrRows.map(r => plotlyWrColor(r.win_rate)).reverse() },
    text: wrRows.map(r => `${r.win_rate.toFixed(1)}%`).reverse(),
    textposition: "outside",
    cliponaxis: false,
    hovertemplate: "%{y}: %{x:.1f}%<extra></extra>",
  }], darkLayout({
    margin: { t: 20, r: 80, b: 30, l: 180 },
    xaxis: { range: [0, 80], gridcolor: "#2a2a4a", zerolinecolor: "#2a2a4a" },
    shapes: [{ type: "line", x0: 50, x1: 50, y0: -0.5, y1: wrRows.length - 0.5,
               line: { color: "#555", width: 1, dash: "dot" } }],
  }), { responsive: true });
}

init();
