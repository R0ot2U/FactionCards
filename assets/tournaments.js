/* Tournaments page */

let allTournaments = [];
let currentEventType = getEventType();
let currentWindow = getWindow();
let currentSortCol = 1;  // Default to date column
let currentSortDir = -1; // -1 = desc, 1 = asc
let manifest = {};
let expandedRows = new Set();

async function loadData(eventType, windowDays, cacheBust = false) {
  const root = dataRoot(eventType, windowDays);
  try {
    manifest = await fetchJSON(`${root}/index.json`, cacheBust);
    const tournaments = await fetchJSON(`${root}/tournaments.json`, cacheBust);
    allTournaments = tournaments;
    return true;
  } catch (e) {
    // Fall back to "all" / "30d" bundle if requested bundle is unavailable
    if (eventType !== "all" || windowDays !== "30d") {
      try {
        manifest = await fetchJSON(`${dataRoot("all", "30d")}/index.json`);
        const tournaments = await fetchJSON(`${dataRoot("all", "30d")}/tournaments.json`);
        allTournaments = tournaments;
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
    document.getElementById("tournaments-tbody").innerHTML =
      `<tr><td colspan="5" class="loading error-state">
        Failed to load data: ${e.message}
        <button class="btn retry-btn" onclick="init()">Retry</button>
      </td></tr>`;
    return false;
  }
}

async function init() {
  // Show loading state
  document.getElementById("tournaments-tbody").innerHTML =
    `<tr><td colspan="5" class="loading">Loading data…</td></tr>`;

  // Use cache-busting on initial page load to ensure fresh data
  const ok = await loadData(currentEventType, currentWindow, true);
  if (!ok) return;

  // Header meta
  document.getElementById("window-label").textContent =
    `Tournaments · ${manifest.window_days}-day window · as of ${manifest.as_of}`;
  document.getElementById("build-info").textContent =
    `${manifest.total_lists.toLocaleString()} lists · ${manifest.total_games.toLocaleString()} games`;

  // Sync active buttons to current state
  document.querySelectorAll("#event-type-btns .btn").forEach(b => {
    b.classList.toggle("active", b.dataset.val === currentEventType);
  });
  document.querySelectorAll("#window-btns .btn").forEach(b => {
    b.classList.toggle("active", b.dataset.val === currentWindow);
  });

  renderTable();
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

      // Update URL without reload
      const url = new URL(window.location);
      url.searchParams.set("window", newWindow);
      history.replaceState(null, "", url);

      expandedRows.clear(); // Reset expanded state
      await loadData(currentEventType, currentWindow);
      renderTable();
      renderFooter(manifest);

      // Update header stats
      document.getElementById("window-label").textContent =
        `Tournaments · ${manifest.window_days}-day window · as of ${manifest.as_of}`;
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

      // Update URL without reload
      const url = new URL(window.location);
      url.searchParams.set("event_type", newType);
      history.replaceState(null, "", url);

      expandedRows.clear(); // Reset expanded state
      await loadData(currentEventType, currentWindow);
      renderTable();
      renderFooter(manifest);

      // Update header stats
      document.getElementById("window-label").textContent =
        `Tournaments · ${manifest.window_days}-day window · as of ${manifest.as_of}`;
      document.getElementById("build-info").textContent =
        `${manifest.total_lists.toLocaleString()} lists · ${manifest.total_games.toLocaleString()} games`;
    });
  });
}

function filteredTournaments() {
  const q = (document.getElementById("search").value || "").toLowerCase().trim();
  let rows = allTournaments;
  if (q) rows = rows.filter(r => r.event_name.toLowerCase().includes(q));
  return sortRowsByColumn(rows);
}

function sortRowsByColumn(rows) {
  const colMap = ["event_name", "date", "players", "rounds", "location"];
  const sortKey = colMap[currentSortCol] || "date";

  return [...rows].sort((a, b) => {
    if (sortKey === "event_name" || sortKey === "location") {
      return (a[sortKey] || "").localeCompare(b[sortKey] || "") * currentSortDir;
    }
    return ((b[sortKey] ?? -999) - (a[sortKey] ?? -999)) * -currentSortDir;
  });
}

function setupColumnSorting() {
  const table = document.getElementById("tournaments-table");
  const headers = table.querySelectorAll("thead th");

  headers.forEach((th, colIdx) => {
    th.style.cursor = "pointer";
    th.addEventListener("click", () => {
      if (currentSortCol === colIdx) {
        currentSortDir = -currentSortDir;
      } else {
        currentSortCol = colIdx;
        currentSortDir = -1; // Default to descending
        if (colIdx === 0) currentSortDir = 1; // Event name defaults to asc
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

function toggleExpanded(eventId) {
  if (expandedRows.has(eventId)) {
    expandedRows.delete(eventId);
  } else {
    expandedRows.add(eventId);
  }
  renderTable();
}

function renderTable() {
  const rows = filteredTournaments();
  document.getElementById("row-count").textContent = `${rows.length} tournaments`;

  const tbody = document.getElementById("tournaments-tbody");
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty">No tournaments match.</td></tr>`;
    return;
  }

  const htmlRows = [];
  rows.forEach((r) => {
    const isExpanded = expandedRows.has(r.event_id);
    const expandIcon = isExpanded ? "▼" : "▶";

    // Main row
    htmlRows.push(`
      <tr class="tournament-row" onclick="toggleExpanded('${r.event_id}')" style="cursor:pointer;">
        <td><span style="color:var(--dim);margin-right:0.5rem;">${expandIcon}</span>${r.event_name}</td>
        <td data-sort="${r.date}">${r.date}</td>
        <td data-sort="${r.players}">${r.players || '—'}</td>
        <td data-sort="${r.rounds}">${r.rounds || '—'}</td>
        <td style="color:var(--dim);font-size:0.8rem">${r.location}</td>
      </tr>
    `);

    // Expandable detail row
    if (isExpanded) {
      let detailHtml = '';
      if (r.top_3 && r.top_3.length > 0) {
        detailHtml = `
          <div style="padding:1rem;background:var(--bg);border-left:3px solid var(--accent);">
            <strong style="color:var(--accent);">Top 3 Placements:</strong>
            <table style="margin-top:0.5rem;width:100%;">
              <thead>
                <tr style="font-size:0.85rem;color:var(--dim);">
                  <th style="text-align:left;padding:0.25rem 0.5rem;">Place</th>
                  <th style="text-align:left;padding:0.25rem 0.5rem;">Player</th>
                  <th style="text-align:left;padding:0.25rem 0.5rem;">Faction</th>
                  <th style="text-align:left;padding:0.25rem 0.5rem;">Record</th>
                  <th style="text-align:left;padding:0.25rem 0.5rem;">List</th>
                </tr>
              </thead>
              <tbody>
                ${r.top_3.map(p => `
                  <tr style="font-size:0.9rem;">
                    <td style="padding:0.25rem 0.5rem;color:var(--dim);">${p.place}</td>
                    <td style="padding:0.25rem 0.5rem;">${p.player_name}</td>
                    <td style="padding:0.25rem 0.5rem;color:var(--dim);font-size:0.8rem;">${p.faction}</td>
                    <td style="padding:0.25rem 0.5rem;">${p.record}</td>
                    <td style="padding:0.25rem 0.5rem;">
                      ${p.list_url ? `<a class="list-link" href="${p.list_url}" target="_blank" rel="noopener">View List ↗</a>` : '—'}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;
      } else {
        detailHtml = `
          <div style="padding:1rem;background:var(--bg);color:var(--dim);">
            No placement data available for this event.
          </div>
        `;
      }

      htmlRows.push(`
        <tr class="detail-row">
          <td colspan="5" style="padding:0;">${detailHtml}</td>
        </tr>
      `);
    }
  });

  tbody.innerHTML = htmlRows.join("");

  // Restore sort indicator
  const headers = document.querySelectorAll("#tournaments-table thead th");
  headers.forEach((h, i) => {
    h.classList.remove("sort-asc", "sort-desc");
    if (i === currentSortCol) {
      h.classList.add(currentSortDir === 1 ? "sort-asc" : "sort-desc");
    }
  });
}

init();
