/* Player leaderboard page */

let allPlayers = [];
let currentEventType = getEventType();
let currentSortCol = 2;  // Default to rating column
let currentSortDir = -1; // -1 = desc, 1 = asc
let manifest = {};

async function loadData(eventType, cacheBust = false) {
  // Players load from event_type level (all-time, not windowed)
  const playersPath = `data/${eventType}/players.json`;
  // Manifest loads from a windowed path (for metadata)
  const manifestPath = dataRoot(eventType, "7d") + "/index.json";

  try {
    manifest = await fetchJSON(manifestPath, cacheBust);
    const players = await fetchJSON(playersPath, cacheBust);
    allPlayers = players;
    return true;
  } catch (e) {
    // Fall back to "all" if requested bundle is unavailable
    if (eventType !== "all") {
      try {
        manifest = await fetchJSON(dataRoot("all", "7d") + "/index.json");
        const players = await fetchJSON("data/all/players.json");
        allPlayers = players;
        currentEventType = "all";
        // Sync button active state to fallback
        document.querySelectorAll("#event-type-btns .btn").forEach(b => {
          b.classList.toggle("active", b.dataset.val === "all");
        });
        return true;
      } catch (_) {}
    }
    document.getElementById("players-tbody").innerHTML =
      `<tr><td colspan="8" class="loading error-state">
        Failed to load data: ${e.message}
        <button class="btn retry-btn" onclick="init()">Retry</button>
      </td></tr>`;
    return false;
  }
}

async function init() {
  // Show loading state
  document.getElementById("players-tbody").innerHTML =
    `<tr><td colspan="8" class="loading">Loading data…</td></tr>`;

  // Use cache-busting on initial page load
  const ok = await loadData(currentEventType, true);
  if (!ok) return;

  // Header meta
  document.getElementById("window-label").textContent =
    `Player Rankings · as of ${manifest.as_of}`;
  document.getElementById("build-info").textContent =
    `${manifest.total_tournaments.toLocaleString()} tournaments · ${manifest.total_lists.toLocaleString()} players · ${manifest.total_games.toLocaleString()} games`;

  // Sync active buttons to current state
  document.querySelectorAll("#event-type-btns .btn").forEach(b => {
    b.classList.toggle("active", b.dataset.val === currentEventType);
  });

  renderTable();
  renderFooter(manifest);

  // Set up column sorting
  setupColumnSorting();

  // Search (debounced for performance)
  document.getElementById("search").addEventListener("input", debounce(() => renderTable(), 200));

  // Event-type buttons — fetch new bundle and re-render
  document.querySelectorAll("#event-type-btns .btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const newType = btn.dataset.val;
      if (newType === currentEventType) return;

      document.querySelectorAll("#event-type-btns .btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentEventType = newType;

      // Update URL without reload
      const url = new URL(window.location);
      url.searchParams.set("event_type", newType);
      history.replaceState(null, "", url);

      await loadData(currentEventType);
      renderTable();
      renderFooter(manifest);

      // Update header stats
      document.getElementById("window-label").textContent =
        `Player Rankings · as of ${manifest.as_of}`;
      document.getElementById("build-info").textContent =
        `${manifest.total_tournaments.toLocaleString()} tournaments · ${manifest.total_lists.toLocaleString()} players · ${manifest.total_games.toLocaleString()} games`;
    });
  });
}

function filteredPlayers() {
  const q = (document.getElementById("search").value || "").toLowerCase().trim();
  let rows = allPlayers;
  if (q) rows = rows.filter(r => r.player_name.toLowerCase().includes(q));
  return sortRowsByColumn(rows);
}

function sortRowsByColumn(rows) {
  const colMap = ["rank", "player_name", "rating", "peak_rating", "games", "win_rate", "factions", "trend_delta", "total_games", "k_factor", "consistency", "upset_rate"];
  const sortKey = colMap[currentSortCol] || "rating";

  return [...rows].sort((a, b) => {
    if (sortKey === "player_name" || sortKey === "factions") {
      return (a[sortKey] || "").localeCompare(b[sortKey] || "") * currentSortDir;
    }
    return ((b[sortKey] ?? -999) - (a[sortKey] ?? -999)) * -currentSortDir;
  });
}

function setupColumnSorting() {
  const table = document.getElementById("players-table");
  const headers = table.querySelectorAll("thead th");

  headers.forEach((th, colIdx) => {
    th.style.cursor = "pointer";
    th.addEventListener("click", () => {
      if (currentSortCol === colIdx) {
        currentSortDir = -currentSortDir;
      } else {
        currentSortCol = colIdx;
        currentSortDir = -1; // Default to descending
        if (colIdx === 1) currentSortDir = 1; // Player name defaults to asc
      }

      // Update header indicators
      headers.forEach(h => h.classList.remove("sort-asc", "sort-desc"));
      th.classList.add(currentSortDir === 1 ? "sort-asc" : "sort-desc");

      renderTable();
    });
  });

  // Set initial indicator
  headers[currentSortCol]?.classList.add("sort-desc");
}

function renderTable() {
  const rows = filteredPlayers();
  document.getElementById("row-count").textContent = `${rows.length} players`;

  const tbody = document.getElementById("players-tbody");
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="12" class="empty">No players match.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map((r) => {
    const wrCls = wrClass(r.win_rate || 0);
    const record = `${r.wins || 0}-${r.losses || 0}` + (r.draws ? `-${r.draws}` : "");

    // K-factor coloring: green for experienced, yellow for standard, orange for new
    const kCls = r.k_factor === 24 ? "wr-green" : r.k_factor === 32 ? "wr-yellow" : "wr-red";

    // Consistency coloring: green for high, yellow for medium, red for low
    const consistency = r.consistency ?? 0;
    const consCls = consistency >= 0.8 ? "wr-green" : consistency >= 0.6 ? "wr-yellow" : "wr-red";

    // Rank is pre-computed by build script
    const rank = r.rank || '—';

    return `
      <tr>
        <td style="color:var(--dim);font-size:0.9rem">${rank}</td>
        <td>${r.player_name || 'Unknown'}</td>
        <td data-sort="${r.rating || 0}"><strong>${Math.round(r.rating || 0)}</strong></td>
        <td data-sort="${r.peak_rating || 0}" style="color:var(--dim);font-size:0.9rem">${Math.round(r.peak_rating || 0)}</td>
        <td data-sort="${r.games || 0}">${r.games || 0}</td>
        <td data-sort="${r.win_rate || 0}" title="${record}"><span class="${wrCls}">${(r.win_rate || 0).toFixed(1)}%</span></td>
        <td style="color:var(--dim);font-size:0.75rem;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${r.factions || 'Unknown'}">${r.factions || 'Unknown'}</td>
        <td data-sort="${r.trend_delta ?? -999}">${ratingTrendHtml(r.trend_delta)}</td>
        <td data-sort="${r.total_games || 0}" style="color:var(--dim);font-size:0.9rem">${r.total_games || 0}</td>
        <td data-sort="${r.k_factor || 32}"><span class="${kCls}">${r.k_factor || 32}</span></td>
        <td data-sort="${consistency}"><span class="${consCls}">${consistency.toFixed(2)}</span></td>
        <td data-sort="${r.upset_rate || 0}" style="font-size:0.9rem">${(r.upset_rate || 0).toFixed(1)}%</td>
      </tr>`;
  }).join("");

  // Restore sort indicator
  const headers = document.querySelectorAll("#players-table thead th");
  headers.forEach((h, i) => {
    h.classList.remove("sort-asc", "sort-desc");
    if (i === currentSortCol) {
      h.classList.add(currentSortDir === 1 ? "sort-asc" : "sort-desc");
    }
  });
}

init();
