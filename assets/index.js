/* Landing page — faction table + bar charts */

let allFactions = [];
let currentEventType = getEventType();
let currentWindow = getWindow();
let currentSortCol = 2;  // Default to play_rate column (0=faction, 1=lists, 2=play_rate)
let currentSortDir = -1; // -1 = desc, 1 = asc
let manifest = {};

let mapData = [];

async function loadData(eventType, window) {
  const root = dataRoot(eventType, window);
  try {
    manifest = await fetchJSON(`${root}/index.json`);
    const factions = await fetchJSON(`${root}/factions.json`);
    allFactions = factions;

    // Load map data for this window
    try {
      mapData = await fetchJSON(`${root}/map.json`);
    } catch (_) {
      mapData = [];
    }

    return true;
  } catch (e) {
    // Fall back to "all" / "7d" bundle if requested bundle is unavailable
    if (eventType !== "all" || window !== "7d") {
      try {
        manifest = await fetchJSON(`${dataRoot("all", "7d")}/index.json`);
        const factions = await fetchJSON(`${dataRoot("all", "7d")}/factions.json`);
        allFactions = factions;
        currentEventType = "all";
        currentWindow = "7d";
        // Load map data for fallback window
        try {
          mapData = await fetchJSON(`${dataRoot("all", "7d")}/map.json`);
        } catch (_) {
          mapData = [];
        }
        // Sync button active state to fallback
        document.querySelectorAll("#event-type-btns .btn").forEach(b => {
          b.classList.toggle("active", b.dataset.val === "all");
        });
        document.querySelectorAll("#window-btns .btn").forEach(b => {
          b.classList.toggle("active", b.dataset.val === "7d");
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

function renderMap(events) {
  if (!events || events.length === 0) {
    document.getElementById("map-chart").innerHTML =
      '<div style="padding:2rem;text-align:center;color:var(--dim);">No location data available</div>';
    return;
  }

  // Group by location (lat, lng rounded to 4 decimals ~11m precision)
  const locationMap = new Map();
  events.forEach(e => {
    const key = `${e.lat.toFixed(4)},${e.lng.toFixed(4)}`;
    if (!locationMap.has(key)) {
      locationMap.set(key, {
        lat: e.lat,
        lng: e.lng,
        location: e.location,
        tournaments: [],
        totalPlayers: 0,
        factionStats: new Map(), // {faction: {totalX0: 0, totalX1: 0, count: 0}}
      });
    }
    const loc = locationMap.get(key);
    loc.tournaments.push(e.name);
    loc.totalPlayers += e.players || 0;

    // Aggregate faction X-0% and X-1% across events
    if (e.faction_x0_pct) {
      Object.entries(e.faction_x0_pct).forEach(([faction, x0]) => {
        if (faction !== 'Unknown') {
          if (!loc.factionStats.has(faction)) {
            loc.factionStats.set(faction, {totalX0: 0, totalX1: 0, count: 0});
          }
          const stats = loc.factionStats.get(faction);
          stats.totalX0 += x0;
          stats.count += 1;
        }
      });
    }
    if (e.faction_x1_pct) {
      Object.entries(e.faction_x1_pct).forEach(([faction, x1]) => {
        if (faction !== 'Unknown') {
          if (!loc.factionStats.has(faction)) {
            loc.factionStats.set(faction, {totalX0: 0, totalX1: 0, count: 0});
          }
          const stats = loc.factionStats.get(faction);
          stats.totalX1 += x1;
        }
      });
    }
  });

  // Convert to array and compute top factions by X-0%, fallback to X-1%
  const locations = Array.from(locationMap.values()).map(loc => {
    const factionMetrics = Array.from(loc.factionStats.entries()).map(([faction, stats]) => ({
      faction,
      avgX0: stats.totalX0 / stats.count,
      avgX1: stats.totalX1 / stats.count
    }));

    // Check if any faction has X-0% > 0
    const hasX0 = factionMetrics.some(f => f.avgX0 > 0);

    let topFactions;
    if (hasX0) {
      // Sort by X-0% descending, show top 3
      topFactions = factionMetrics
        .filter(f => f.avgX0 > 0)
        .sort((a, b) => b.avgX0 - a.avgX0)
        .slice(0, 3)
        .map(f => `${f.faction} (${f.avgX0.toFixed(1)}% X-0)`);
    } else {
      // Fallback to X-1%
      topFactions = factionMetrics
        .filter(f => f.avgX1 > 0)
        .sort((a, b) => b.avgX1 - a.avgX1)
        .slice(0, 3)
        .map(f => `${f.faction} (${f.avgX1.toFixed(1)}% X-1)`);
    }

    return { ...loc, topFactions };
  });

  const trace = {
    type: 'scattergeo',
    lat: locations.map(loc => loc.lat),
    lon: locations.map(loc => loc.lng),
    text: locations.map(loc => {
      const topFactionsStr = loc.topFactions.length > 0
        ? `<br>Top factions: ${loc.topFactions.join(', ')}`
        : '';
      return `${loc.location}<br>${loc.tournaments.length} tournament${loc.tournaments.length > 1 ? 's' : ''}<br>${loc.totalPlayers} total players${topFactionsStr}`;
    }),
    hoverinfo: 'text',
    marker: {
      size: locations.map(loc => Math.max(8, Math.sqrt(loc.tournaments.length) * 8 + Math.sqrt(loc.totalPlayers) * 0.5)),
      color: '#e94560',
      opacity: 0.8,
      line: { width: 0.5, color: '#fff' }
    },
    mode: 'markers',
  };

  const layout = {
    geo: {
      projection: {
        type: 'natural earth',
        scale: 1
      },
      center: { lon: 0, lat: 20 },
      showland: true,
      landcolor: '#1a1a2e',
      showocean: true,
      oceancolor: '#0f0f1a',
      showlakes: false,
      showcountries: true,
      countrycolor: '#2a2a4a',
      coastlinecolor: '#2a2a4a',
      bgcolor: 'rgba(0,0,0,0)',
    },
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    margin: { t: 0, b: 0, l: 0, r: 0 },
    height: 450,
  };

  const config = plotlyConfig({
    scrollZoom: true,  // Only enabled on desktop via plotlyConfig()
    toImageButtonOptions: {
      format: 'png',
      filename: 'tournament_locations',
      height: 800,
      width: 1400,
    }
  });

  // Prevent zooming out beyond the initial view
  Plotly.newPlot('map-chart', [trace], layout, config).then(gd => {
    let isUpdating = false;
    gd.on('plotly_relayout', (eventData) => {
      if (isUpdating) return;

      // Get current scale from layout or event
      const currentScale = eventData['geo.projection.scale'] !== undefined
        ? eventData['geo.projection.scale']
        : gd.layout.geo.projection.scale;

      // If at or below minimum zoom, lock scale and center
      if (currentScale !== undefined && currentScale <= 1.01) {
        isUpdating = true;
        Plotly.relayout(gd, {
          'geo.projection.scale': 1,
          'geo.center.lon': 0,
          'geo.center.lat': 20
        }).then(() => {
          isUpdating = false;
        });
      }
    });
  });

}

// Helper to lazy-render map only when scrolled into view
function lazyRenderMap(mapDataToRender) {
  const mapEl = document.getElementById("map-chart");
  if (!mapEl) return;

  // Disconnect any existing observer
  if (mapEl._mapObserver) {
    mapEl._mapObserver.disconnect();
  }

  const observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) {
      renderMap(mapDataToRender);
      observer.disconnect();
    }
  }, { rootMargin: "200px" });

  mapEl._mapObserver = observer;
  observer.observe(mapEl);
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
    `${manifest.total_tournaments.toLocaleString()} tournaments · ${manifest.total_lists.toLocaleString()} players · ${manifest.total_games.toLocaleString()} games`;

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
  lazyRenderMap(mapData);

  // Set up column sorting
  setupColumnSorting();

  // Search (debounced for performance)
  document.getElementById("search").addEventListener("input", debounce(() => renderTable(), 200));

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
      lazyRenderMap(mapData);

      // Update header stats
      document.getElementById("window-label").textContent =
        `${manifest.window_days}-day window · as of ${manifest.as_of}`;
      document.getElementById("build-info").textContent =
        `${manifest.total_tournaments.toLocaleString()} tournaments · ${manifest.total_lists.toLocaleString()} players · ${manifest.total_games.toLocaleString()} games`;
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
      lazyRenderMap(mapData);

      // Update header stats
      document.getElementById("window-label").textContent =
        `${manifest.window_days}-day window · as of ${manifest.as_of}`;
      document.getElementById("build-info").textContent =
        `${manifest.total_tournaments.toLocaleString()} tournaments · ${manifest.total_lists.toLocaleString()} players · ${manifest.total_games.toLocaleString()} games`;
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
  const colMap = ["faction", "lists", "play_rate", "win_rate", "x0_pct", "x1_pct", "trend_delta", "top_detachment", "top_disposition"];
  const sortKey = colMap[currentSortCol] || "play_rate";

  return [...rows].sort((a, b) => {
    if (sortKey === "faction" || sortKey === "top_detachment" || sortKey === "top_disposition") {
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
      // Note: renderCharts() removed — charts sort independently, no need to re-render
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
    tbody.innerHTML = `<tr><td colspan="8" class="empty">No factions match.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(r => {
    const wrCls = wrClass(r.win_rate);
    const slug = r.slug || factionSlug(r.faction);
    const x0_pct = r.x0_pct != null ? r.x0_pct.toFixed(1) + '%' : '—';
    const x1_pct = r.x1_pct != null ? r.x1_pct.toFixed(1) + '%' : '—';
    return `
      <tr>
        <td><a class="faction-link" href="${factionHref(slug)}">${r.faction}</a></td>
        <td data-sort="${r.lists}">${r.lists.toLocaleString()}</td>
        <td data-sort="${r.play_rate}" title="Share of all players in the window using this faction">${r.play_rate.toFixed(1)}%</td>
        <td data-sort="${r.win_rate}" title="Win rate across all games in the window (draw = 0.5 win)">${'<span class="' + wrCls + '">' + r.win_rate.toFixed(1) + '%</span>'}</td>
        <td data-sort="${r.x0_pct ?? -999}" title="Percentage of players going undefeated">${x0_pct}</td>
        <td data-sort="${r.x1_pct ?? -999}" title="Percentage of players with exactly 1 loss">${x1_pct}</td>
        <td data-sort="${r.trend_delta ?? -999}" title="Win-rate change vs the previous ${manifest.window_days}-day window">${trendHtml(r.trend_delta)}</td>
        <td style="color:var(--dim);font-size:0.8rem">${r.top_detachment || "—"}</td>
        <td style="color:var(--dim);font-size:0.8rem">${r.top_disposition || "—"}</td>
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
  Plotly.react("chart-play", [{
    type: "bar",
    orientation: "h",
    y: playRows.map(r => r.faction).reverse(),
    x: playRows.map(r => r.play_rate).reverse(),
    marker: { color: "#1565c0" },
    text: playRows.map(r => `${r.play_rate.toFixed(1)}%`).reverse(),
    textposition: "outside",
    cliponaxis: false,
    hovertemplate: "%{y}: %{x:.1f}%<extra></extra>",
  }], darkLayout({ margin: { t: 20, r: 80, b: 30, l: 180 } }), plotlyConfig());

  // Win rate bar — sorted by win rate desc
  const wrRows = [...rows].sort((a, b) => b.win_rate - a.win_rate).slice(0, 28);
  Plotly.react("chart-wr", [{
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
  }), plotlyConfig());

  // Disposition chart (11th edition only)
  if (manifest.dispositions && manifest.dispositions.length > 0) {
    const dispSection = document.getElementById("disposition-chart-section");
    if (dispSection) dispSection.style.display = "block";

    const disps = manifest.dispositions;
    Plotly.react("chart-disposition", [{
      type: "bar",
      orientation: "h",
      y: disps.map(d => d.disposition).reverse(),
      x: disps.map(d => d.win_rate).reverse(),
      marker: { color: disps.map(d => plotlyWrColor(d.win_rate)).reverse() },
      text: disps.map(d => `${d.win_rate.toFixed(1)}% (n=${d.games})`).reverse(),
      textposition: "outside",
      cliponaxis: false,
      hovertemplate: "%{y}: %{x:.1f}%<extra></extra>",
    }], darkLayout({
      margin: { t: 20, r: 120, b: 30, l: 180 },
      xaxis: { range: [0, 80], gridcolor: "#2a2a4a", zerolinecolor: "#2a2a4a" },
      shapes: [{ type: "line", x0: 50, x1: 50, y0: -0.5, y1: disps.length - 0.5,
                 line: { color: "#555", width: 1, dash: "dot" } }],
    }), plotlyConfig());
  }
}

init();
