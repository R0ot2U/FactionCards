/* Dispositions page — overview, matchup heatmap, expandable tables, top armies/detachments, avg VP */

const DISPOSITIONS = [
  "Purge the Foe",
  "Take and Hold",
  "Priority Assets",
  "Disruption",
  "Reconnaissance",
];

let allData = null;
let manifest = {};
let currentEventType = getEventType();
let currentWindow = getWindow();
let currentDispositionTab = DISPOSITIONS[0];
let currentArmiesDetachmentsMode = "armies";
let currentTopSortBy = "win_rate";

async function loadData(eventType, window) {
  const root = dataRoot(eventType, window);
  setStatus("Loading data…", false);
  try {
    manifest = await fetchJSON(`${root}/index.json`);
  } catch (_) {
    manifest = {};
  }
  try {
    allData = await fetchJSON(`${root}/dispositions.json`);
    setStatus("", false);
    return true;
  } catch (e) {
    allData = null;
    setStatus(`Disposition data is not yet available for this window (${e.message}). The build pipeline will populate dispositions.json in a future run.`, true);
    return false;
  }
}

function setStatus(msg, isError) {
  const el = document.getElementById("status");
  if (!el) return;
  if (!msg) {
    el.style.display = "none";
    el.textContent = "";
    el.classList.remove("error-state");
    return;
  }
  el.style.display = "block";
  el.textContent = msg;
  el.classList.toggle("error-state", !!isError);
}

function overviewByDisposition() {
  const map = new Map();
  const list = (allData && allData.overview) || [];
  list.forEach(o => map.set(o.disposition, o));
  return map;
}

function renderOverviewChart() {
  if (typeof Plotly === "undefined") return;
  const map = overviewByDisposition();
  const rows = DISPOSITIONS.map(d => map.get(d)).filter(Boolean);
  if (!rows.length) {
    document.getElementById("chart-disposition-overview").innerHTML =
      `<div class="empty">No disposition data.</div>`;
    return;
  }
  const isMobile = window.innerWidth <= 600;
  const title = `Force Disposition Win Rate${turnLabel()}`;
  Plotly.react("chart-disposition-overview", [{
    type: "bar",
    orientation: "h",
    y: rows.map(r => r.disposition).reverse(),
    x: rows.map(r => ftWinRate(r)).reverse(),
    marker: { color: rows.map(r => plotlyWrColor(ftWinRate(r))).reverse() },
    text: rows.map(r => {
      const wr = ftWinRate(r);
      return wr != null ? `${wr.toFixed(1)}% (n=${ftGames(r)})` : `—% (n=${ftGames(r)})`;
    }).reverse(),
    textposition: "outside",
    cliponaxis: false,
    hovertemplate: "%{y}: %{x:.1f}%<extra></extra>",
  }], darkLayout({
    title: title,
    margin: { t: 40, r: isMobile ? 50 : 120, b: 30, l: isMobile ? 150 : 200 },
    xaxis: { range: [0, 80], gridcolor: "#2a2a4a", zerolinecolor: "#2a2a4a" },
    yaxis: { tickfont: { size: 11 } },
    shapes: [{
      type: "line", x0: 50, x1: 50,
      y0: -0.5, y1: rows.length - 0.5,
      line: { color: "#555", width: 1, dash: "dot" }
    }],
  }), plotlyConfig());
}

function renderMatchupHeatmap() {
  if (typeof Plotly === "undefined") return;
  const container = document.getElementById("matchup-heatmap");
  const matchups = (allData && allData.matchups) || [];
  if (!matchups.length) {
    container.innerHTML = `<div class="empty">No matchup data.</div>`;
    return;
  }

  const lookup = new Map();
  matchups.forEach(m => {
    lookup.set(`${m.disposition}|${m.opponent}`, m);
  });

  // Truncate labels on mobile for better fit
  const isMobile = window.innerWidth <= 600;
  const labels = isMobile
    ? DISPOSITIONS.map(d => d.split(' ')[0])  // "Purge", "Take", "Priority", "Disruption", "Reconnaissance"
    : DISPOSITIONS;

  // z[row][col] = win rate; null cells are mirrors (diagonal)
  const z = [];
  const text = [];
  for (let i = 0; i < DISPOSITIONS.length; i++) {
    const zRow = [];
    const tRow = [];
    for (let j = 0; j < DISPOSITIONS.length; j++) {
      if (i === j) {
        // Mirror match - grey out
        zRow.push(null);
        tRow.push("");
      } else {
        const m = lookup.get(`${DISPOSITIONS[i]}|${DISPOSITIONS[j]}`);
        if (m && ftWinRate(m) != null) {
          zRow.push(ftWinRate(m));
          const games = ftGames(m) != null ? ` (n=${ftGames(m)})` : "";
          tRow.push(`${ftWinRate(m).toFixed(1)}%${games}`);
        } else {
          zRow.push(null);
          tRow.push("");
        }
      }
    }
    z.push(zRow);
    text.push(tRow);
  }

  Plotly.react("matchup-heatmap", [{
    type: "heatmap",
    x: labels,
    y: labels,
    z: z,
    text: text,
    texttemplate: "%{text}",
    hovertemplate: "%{y} vs %{x}<br>Win rate: %{z:.1f}%<extra></extra>",
    colorscale: [
      [0.0, "#e53935"],
      [0.5, "#ffb300"],
      [1.0, "#4caf50"],
    ],
    zmin: 40,
    zmax: 60,
    showscale: true,
    colorbar: {
      title: { text: "Win %", font: { color: "#eaeaea" } },
      tickfont: { color: "#eaeaea" },
    },
    xgap: 2,
    ygap: 2,
  }], darkLayout({
    margin: { t: 30, r: isMobile ? 20 : 30, b: isMobile ? 60 : 100, l: isMobile ? 80 : 150 },
    xaxis: { tickangle: -30, gridcolor: "#2a2a4a", zerolinecolor: "#2a2a4a" },
    yaxis: { autorange: "reversed", gridcolor: "#2a2a4a" },
  }), plotlyConfig());
}

function renderMatchupTables() {
  const container = document.getElementById("matchup-tables");
  const matchups = (allData && allData.matchups) || [];
  if (!matchups.length) {
    container.innerHTML = `<div class="empty">No matchup data.</div>`;
    return;
  }

  const grouped = new Map();
  DISPOSITIONS.forEach(d => grouped.set(d, []));
  matchups.forEach(m => {
    if (grouped.has(m.disposition)) grouped.get(m.disposition).push(m);
  });

  container.innerHTML = DISPOSITIONS.map(disp => {
    const rows = grouped.get(disp) || [];
    if (!rows.length) {
      return `<details class="matchup-details"><summary>${disp}</summary>
        <div class="empty">No matchups recorded.</div></details>`;
    }
    rows.sort((a, b) => (ftWinRate(b) ?? -1) - (ftWinRate(a) ?? -1));
    const body = rows.map(r => {
      const wrVal = ftWinRate(r);
      const wrCls = wrVal != null ? wrClass(wrVal) : "";
      const wr = wrVal != null ? `<span class="${wrCls}">${wrVal.toFixed(1)}%</span>` : "—";
      return `<tr>
        <td>${r.opponent}</td>
        <td>${ftGames(r).toLocaleString()}</td>
        <td>${wr}</td>
      </tr>`;
    }).join("");
    return `<details class="matchup-details">
      <summary>${disp} <span class="panel-note">(${rows.length} matchups)</span></summary>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Opponent</th><th>Games</th><th>Win %</th></tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    </details>`;
  }).join("");
}

function renderTopArmiesDetachments() {
  const tabs = document.getElementById("disposition-tabs");
  tabs.innerHTML = DISPOSITIONS.map(d =>
    `<button class="tab-btn ${d === currentDispositionTab ? "active" : ""}" data-disp="${d}">${d}</button>`
  ).join("");
  tabs.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      currentDispositionTab = btn.dataset.disp;
      renderTopArmiesDetachments();
    });
  });

  document.querySelectorAll("#armies-detachments-toggle .btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.val === currentArmiesDetachmentsMode);
    btn.onclick = () => {
      currentArmiesDetachmentsMode = btn.dataset.val;
      renderTopArmiesDetachments();
    };
  });

  document.querySelectorAll("#top-sort-toggle .btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.val === currentTopSortBy);
    btn.onclick = () => {
      currentTopSortBy = btn.dataset.val;
      renderTopArmiesDetachments();
    };
  });

  const body = document.getElementById("armies-detachments-table");
  if (!allData) {
    body.innerHTML = `<div class="empty">No data.</div>`;
    return;
  }

  const field = currentArmiesDetachmentsMode === "armies" ? "top_armies" : "top_detachments";
  const labelHeader = currentArmiesDetachmentsMode === "armies" ? "Faction" : "Detachment";
  const bucket = (allData[field] || {})[currentDispositionTab] || [];
  if (!bucket.length) {
    body.innerHTML = `<div class="empty">No ${currentArmiesDetachmentsMode} data for ${currentDispositionTab}.</div>`;
    return;
  }

  // Sort by selected field
  const sorted = [...bucket].sort((a, b) => {
    const aVal = a[currentTopSortBy] ?? 0;
    const bVal = b[currentTopSortBy] ?? 0;
    return bVal - aVal;
  });

  const rows = sorted.slice(0, 5).map(r => {
    const wrVal = ftWinRate(r);
    const wrCls = wrVal != null ? wrClass(wrVal) : "";
    const wr = wrVal != null ? `<span class="${wrCls}">${wrVal.toFixed(1)}%</span>` : "—";
    const x0 = r.x0_pct != null ? `${r.x0_pct.toFixed(1)}%` : "—";
    const name = r.faction || r.base_archetype || r.name || "—";
    // Link to faction page if this is an army
    let nameCell;
    if (currentArmiesDetachmentsMode === "armies" && r.faction) {
      const factionSlug = r.faction.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const factionUrl = `/faction.html?faction=${encodeURIComponent(factionSlug)}`;
      nameCell = `<a href="${factionUrl}" style="color:var(--text);">${name}</a>`;
    } else {
      nameCell = name;
    }
    return `<tr>
      <td>${nameCell}</td>
      <td>${(r.lists ?? 0).toLocaleString()}</td>
      <td>${ftGames(r).toLocaleString()}</td>
      <td>${wr}</td>
      <td>${x0}</td>
    </tr>`;
  }).join("");

  body.innerHTML = `<div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>${labelHeader}</th>
          <th>Lists</th>
          <th>Games</th>
          <th>Win %</th>
          <th title="Percentage of lists going undefeated">X-0 %</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function render() {
  renderOverviewChart();
  renderMatchupHeatmap();
  renderMatchupTables();
  renderTopArmiesDetachments();
}

function syncHeaderMeta() {
  const wl = document.getElementById("window-label");
  if (wl && manifest.window_days) {
    wl.textContent = `${manifest.window_days}-day window · as of ${manifest.as_of}`;
  }
  const bi = document.getElementById("build-info");
  if (bi && manifest.total_tournaments != null) {
    bi.textContent = `${manifest.total_tournaments.toLocaleString()} tournaments · ${manifest.total_lists.toLocaleString()} players · ${manifest.total_games.toLocaleString()} games`;
  }
  const cardsLink = document.getElementById("cards-link");
  if (cardsLink && manifest.cards_url) cardsLink.href = manifest.cards_url;
}

function syncFilterButtons() {
  document.querySelectorAll("#event-type-btns .btn").forEach(b => {
    b.classList.toggle("active", b.dataset.val === currentEventType);
  });
  document.querySelectorAll("#window-btns .btn").forEach(b => {
    b.classList.toggle("active", b.dataset.val === currentWindow);
  });
  document.querySelectorAll("#first-turn-btns .btn").forEach(b => {
    b.classList.toggle("active", b.dataset.val === turnFilter);
  });
}

function wireFilterButtons() {
  document.querySelectorAll("#window-btns .btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const newWindow = btn.dataset.val;
      if (newWindow === currentWindow) return;
      currentWindow = newWindow;
      syncFilterButtons();
      const url = new URL(window.location);
      url.searchParams.set("window", newWindow);
      history.replaceState(null, "", url);
      await loadData(currentEventType, currentWindow);
      syncHeaderMeta();
      render();
      renderFooter(manifest);
    });
  });

  document.querySelectorAll("#event-type-btns .btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const newType = btn.dataset.val;
      if (newType === currentEventType) return;
      currentEventType = newType;
      syncFilterButtons();
      const url = new URL(window.location);
      url.searchParams.set("event_type", newType);
      history.replaceState(null, "", url);
      await loadData(currentEventType, currentWindow);
      syncHeaderMeta();
      render();
      renderFooter(manifest);
    });
  });

  document.querySelectorAll("#first-turn-btns .btn").forEach(btn => {
    btn.addEventListener("click", () => {
      setTurnFilter(btn.dataset.val);
      document.querySelectorAll("#first-turn-btns .btn").forEach(b => {
        b.classList.toggle("active", b.dataset.val === turnFilter);
      });
      render();
    });
  });
}

async function init() {
  syncFilterButtons();
  await loadData(currentEventType, currentWindow);
  syncHeaderMeta();
  render();
  renderFooter(manifest);
  wireFilterButtons();
}

document.addEventListener("DOMContentLoaded", init);
