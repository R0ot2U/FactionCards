/* Country leaderboard page. */

let allCountries = [];
let currentEventType = getEventType();
let currentSortCol = 3;  // Default to avg rating column
let currentSortDir = -1; // -1 = desc, 1 = asc
let manifest = {};

async function loadData(eventType, cacheBust = false) {
  // Countries load from event_type level (all-time, not windowed) — same as players.json
  const countriesPath = `data/${eventType}/countries.json`;
  const manifestPath = dataRoot(eventType, "7d") + "/index.json";

  try {
    manifest = await fetchJSON(manifestPath, cacheBust);
    const countries = await fetchJSON(countriesPath, cacheBust);
    allCountries = countries;
    return true;
  } catch (e) {
    if (eventType !== "all") {
      try {
        manifest = await fetchJSON(dataRoot("all", "7d") + "/index.json");
        const countries = await fetchJSON("data/all/countries.json");
        allCountries = countries;
        currentEventType = "all";
        document.querySelectorAll("#event-type-btns .btn").forEach(b => {
          b.classList.toggle("active", b.dataset.val === "all");
        });
        return true;
      } catch (_) {}
    }
    document.getElementById("countries-tbody").innerHTML =
      `<tr><td colspan="8" class="loading error-state">
        Failed to load data: ${e.message}
        <button class="btn retry-btn" onclick="init()">Retry</button>
      </td></tr>`;
    return false;
  }
}

async function init() {
  document.getElementById("countries-tbody").innerHTML =
    `<tr><td colspan="8" class="loading">Loading data…</td></tr>`;

  const ok = await loadData(currentEventType, true);
  if (!ok) return;

  document.getElementById("window-label").textContent =
    `Country Rankings · as of ${manifest.as_of}`;
  document.getElementById("build-info").textContent =
    `${manifest.total_tournaments.toLocaleString()} tournaments · ${manifest.total_lists.toLocaleString()} players · ${manifest.total_games.toLocaleString()} games`;

  document.querySelectorAll("#event-type-btns .btn").forEach(b => {
    b.classList.toggle("active", b.dataset.val === currentEventType);
  });

  renderTable();
  renderFooter(manifest);

  setupColumnSorting();

  document.getElementById("search").addEventListener("input", debounce(() => renderTable(), 200));

  document.querySelectorAll("#event-type-btns .btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const newType = btn.dataset.val;
      if (newType === currentEventType) return;

      document.querySelectorAll("#event-type-btns .btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentEventType = newType;

      const url = new URL(window.location);
      url.searchParams.set("event_type", newType);
      history.replaceState(null, "", url);

      await loadData(currentEventType);
      renderTable();
      renderFooter(manifest);

      document.getElementById("window-label").textContent =
        `Country Rankings · as of ${manifest.as_of}`;
      document.getElementById("build-info").textContent =
        `${manifest.total_tournaments.toLocaleString()} tournaments · ${manifest.total_lists.toLocaleString()} players · ${manifest.total_games.toLocaleString()} games`;
    });
  });
}

function filteredCountries() {
  const q = (document.getElementById("search").value || "").toLowerCase().trim();
  let rows = allCountries;
  if (q) rows = rows.filter(r => r.country.toLowerCase().includes(q));
  return sortRowsByColumn(rows);
}

function sortRowsByColumn(rows) {
  const colMap = ["rank", "country", "player_count", "avg_rating", "avg_win_rate", "total_games", "event_count", "top_player"];
  const sortKey = colMap[currentSortCol] || "avg_rating";

  return [...rows].sort((a, b) => {
    if (sortKey === "country" || sortKey === "top_player") {
      return (a[sortKey] || "").localeCompare(b[sortKey] || "") * currentSortDir;
    }
    return ((b[sortKey] ?? -999) - (a[sortKey] ?? -999)) * -currentSortDir;
  });
}

function setupColumnSorting() {
  const table = document.getElementById("countries-table");
  const headers = table.querySelectorAll("thead th");

  headers.forEach((th, colIdx) => {
    th.style.cursor = "pointer";
    th.addEventListener("click", () => {
      if (currentSortCol === colIdx) {
        currentSortDir = -currentSortDir;
      } else {
        currentSortCol = colIdx;
        currentSortDir = -1;
        if (colIdx === 1 || colIdx === 7) currentSortDir = 1; // Country / Top player default to asc
      }

      headers.forEach(h => h.classList.remove("sort-asc", "sort-desc"));
      th.classList.add(currentSortDir === 1 ? "sort-asc" : "sort-desc");

      renderTable();
    });
  });

  headers[currentSortCol]?.classList.add("sort-desc");
}

function countryHref(slug) {
  const q = currentEventType ? `?c=${encodeURIComponent(slug)}&event_type=${encodeURIComponent(currentEventType)}` : `?c=${encodeURIComponent(slug)}`;
  return `country.html${q}`;
}

function renderTable() {
  const rows = filteredCountries();
  document.getElementById("row-count").textContent = `${rows.length} countries`;

  const tbody = document.getElementById("countries-tbody");
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty">No countries match.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map((r) => {
    const wrCls = wrClass(r.avg_win_rate || 0);
    return `
      <tr>
        <td style="color:var(--dim);font-size:0.9rem">${r.rank || '—'}</td>
        <td><a href="${countryHref(r.slug)}" style="color:var(--text);font-weight:600;">${r.country}</a></td>
        <td data-sort="${r.player_count || 0}">${r.player_count || 0}</td>
        <td data-sort="${r.avg_rating || 0}"><strong>${Math.round(r.avg_rating || 0)}</strong></td>
        <td data-sort="${r.avg_win_rate || 0}"><span class="${wrCls}">${(r.avg_win_rate || 0).toFixed(1)}%</span></td>
        <td data-sort="${r.total_games || 0}" style="color:var(--dim);font-size:0.9rem">${(r.total_games || 0).toLocaleString()}</td>
        <td data-sort="${r.event_count || 0}" style="color:var(--dim);font-size:0.9rem">${r.event_count || 0}</td>
        <td style="color:var(--dim);font-size:0.85rem">${r.top_player || '—'}</td>
      </tr>`;
  }).join("");

  const headers = document.querySelectorAll("#countries-table thead th");
  headers.forEach((h, i) => {
    h.classList.remove("sort-asc", "sort-desc");
    if (i === currentSortCol) {
      h.classList.add(currentSortDir === 1 ? "sort-asc" : "sort-desc");
    }
  });
}

init();
