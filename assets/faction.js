/* Faction detail page */

let currentSlug = "";
let currentEventType = getEventType();
let currentWindow = getWindow();

async function loadFactionData(slug, eventType, windowDays) {
  const backUrl = `index.html?event_type=${encodeURIComponent(eventType)}&window=${encodeURIComponent(windowDays)}`;

  let data;
  let usedFallback = false;
  try {
    data = await fetchJSON(`${dataRoot(eventType, windowDays)}/faction/${slug}.json`);
  } catch (e) {
    // Try fallback to "all" / "7d" bundle
    if (eventType !== "all" || windowDays !== "7d") {
      try {
        data = await fetchJSON(`${dataRoot("all", "7d")}/faction/${slug}.json`);
        usedFallback = true;
      } catch (_) {}
    }
    if (!data) {
      document.getElementById("content").innerHTML =
        `<p class="empty" style="color:var(--red)">
          No data available for ${slug} in the ${windowDays} ${eventType} window.
          <br><span style="color:var(--dim);font-size:0.9em">There may be no tournaments in this time period.</span>
          <br><a href="${backUrl}">← Back to explorer</a>
        </p>`;
      return null;
    }
  }

  let manifest = {};
  try { manifest = await fetchJSON(`${dataRoot(eventType, windowDays)}/index.json`); } catch (_) {}

  // Load map data for this window
  let mapData = [];
  try {
    const root = dataRoot(eventType, windowDays);
    mapData = await fetchJSON(`${root}/map.json`);
  } catch (_) {
    // If error, try fallback window
    if (usedFallback) {
      try {
        const fallbackRoot = dataRoot("all", "30d");
        mapData = await fetchJSON(`${fallbackRoot}/map.json`);
      } catch (_) {
        mapData = [];
      }
    } else {
      mapData = [];
    }
  }

  return { data, manifest, backUrl, usedFallback, mapData };
}

function renderFactionPage(result) {
  if (!result) return;

  const { data, manifest, backUrl, usedFallback, mapData } = result;

  // Update links
  const backLink = document.getElementById("back-link");
  const breadcrumbBack = document.getElementById("breadcrumb-back");
  if (backLink) backLink.href = backUrl;
  if (breadcrumbBack) breadcrumbBack.href = backUrl;

  // Page title and header
  document.title = `${data.faction} — Informed Crusader`;
  document.getElementById("breadcrumb-faction").textContent = data.faction;
  document.getElementById("window-label").textContent =
    `${data.faction} · ${data.window_days}-day window · as of ${data.as_of}`;

  // Build content
  const content = document.getElementById("content");
  content.className = "";

  const fallbackWarning = usedFallback
    ? `<div style="background:var(--yellow);color:#000;padding:12px 20px;margin:-10px -20px 20px;border-radius:6px;font-size:0.9em;">
         ⚠️ No data available for the selected time window. Showing 30-day data instead.
       </div>`
    : '';

  content.innerHTML = `
    ${fallbackWarning}
    ${heroHtml(data)}

    <p class="section-title">Detachments & Rankings</p>
    <div class="three-col">
      <div class="panel ranking-panel">
        <div class="panel-title">Faction Rankings</div>
        <div id="rankings-table-container"></div>
      </div>
      <div class="panel">
        <div class="panel-title">Detachment Breakdown <span class="panel-note">(min 5 games)</span></div>
        <div class="table-wrap">${detachmentTable(data.detachments)}</div>
      </div>
      <div class="chart-wrap">
        <div class="panel-title">
          Detachment Distribution <span class="panel-note">(top 10)</span>
          <div class="pie-metric-btns" style="float:right;display:inline-flex;gap:4px;font-size:0.75rem;">
            <button class="pie-btn active" data-metric="play_rate">Play %</button>
            <button class="pie-btn" data-metric="win_rate">Win %</button>
            <button class="pie-btn" data-metric="tournament_wins">T.Wins</button>
          </div>
        </div>
        <div id="chart-det-pie" class="chart-det-pie"></div>
      </div>
    </div>

    <p class="section-title">Detachment Performance</p>
    <div class="chart-wrap">
      <div class="panel-title">Play Rate by Detachment <span class="panel-note">(min 5 games)</span></div>
      <div id="chart-det" class="chart-det"></div>
    </div>

    ${data.dispositions && data.dispositions.length > 0 ? `
    <p class="section-title">Force Dispositions <span style="color:var(--dim);font-size:0.85rem;font-weight:normal;">(11th Edition)</span></p>
    <div class="two-col">
      <div class="panel">
        <div class="panel-title">Disposition Breakdown</div>
        <div class="table-wrap">${dispositionTable(data.dispositions)}</div>
      </div>
      <div class="chart-wrap">
        <div class="panel-title">Disposition Distribution</div>
        <div id="chart-disp" class="chart-disp"></div>
      </div>
    </div>
    ` : ''}

    <p class="section-title">Matchups vs All Factions</p>
    <div class="chart-wrap">
      <div class="panel-title">Win Rate into Opponent <span class="panel-note">(min 5 games)</span></div>
      <div id="chart-matchup" class="chart-matchup"></div>
    </div>

    <p class="section-title">Top Players</p>
    <div class="panel">
      <div class="panel-title">Top 20 Players by Win Rate <span class="panel-note">(min 3 games)</span></div>
      <div class="table-wrap">${playersTable(data.top_players)}</div>
    </div>

    <p class="section-title">Tournament Locations</p>
    <div class="chart-wrap map-wrap">
      <div class="panel-title">Where ${data.faction} Competed</div>
      <div id="map-chart"></div>
    </div>

    <p class="section-title">Trend</p>
    <div class="two-col">
      <div class="chart-wrap">
        <div class="panel-title">Lists per Week</div>
        <div id="chart-lists" class="chart-timeline"></div>
      </div>
      <div class="chart-wrap">
        <div class="panel-title">Win Rate per Week</div>
        <div id="chart-wr-timeline" class="chart-timeline"></div>
      </div>
    </div>
    <div class="panel">
      <div class="panel-title">Weekly Performance</div>
      <div class="table-wrap">${timelineTable(data.timeline)}</div>
    </div>
  `;

  renderFooter(manifest);

  // Render charts and load rankings after DOM is built
  requestAnimationFrame(async () => {
    renderDetChart(data.detachments);
    renderDetPieChart(data.detachments, 'play_rate');
    if (data.dispositions && data.dispositions.length > 0) {
      renderDispChart(data.dispositions);
    }
    renderMatchupChart(data.matchups);
    renderTimeline(data.timeline);
    if (mapData && mapData.length > 0) {
      renderFactionMap(data.faction, mapData);
    }
    document.querySelectorAll("table").forEach(makeSortable);

    // Set up pie chart metric switcher
    document.querySelectorAll('.pie-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.pie-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderDetPieChart(data.detachments, btn.dataset.metric);
      });
    });

    // Load and render rankings
    const rankings = await loadRankings(data.event_type, data.window_days + 'd', data.faction);
    const rankingsContainer = document.getElementById('rankings-table-container');
    if (rankingsContainer) {
      rankingsContainer.innerHTML = rankingsTable(rankings);
    }
  });
}

async function init() {
  const params = new URLSearchParams(window.location.search);
  currentSlug = params.get("faction");

  if (!currentSlug) {
    document.getElementById("content").innerHTML =
      `<p class="empty">No faction specified. <a href="index.html">Return to explorer.</a></p>`;
    return;
  }

  // Load initial data
  const result = await loadFactionData(currentSlug, currentEventType, currentWindow);
  renderFactionPage(result);

  // Sync active buttons to current state
  document.querySelectorAll("#event-type-btns .btn").forEach(b => {
    b.classList.toggle("active", b.dataset.val === currentEventType);
  });
  document.querySelectorAll("#window-btns .btn").forEach(b => {
    b.classList.toggle("active", b.dataset.val === currentWindow);
  });

  // Set up filter button handlers (once)
  setupFilterButtons();
}

function setupFilterButtons() {
  // Window buttons — fetch new data without reload
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

      // Fetch and render new data
      const result = await loadFactionData(currentSlug, currentEventType, currentWindow);
      renderFactionPage(result);
    });
  });

  // Event-type buttons — fetch new data without reload
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

      // Fetch and render new data
      const result = await loadFactionData(currentSlug, currentEventType, currentWindow);
      renderFactionPage(result);
    });
  });

}

function metaHealthBadge(data) {
  if (!data.meta_health) return '';
  const health = data.meta_health;
  const labels = {
    'strongly_over': 'Strong',
    'slightly_over': 'Overperform',
    'neutral': 'Average',
    'slightly_under': 'Underperform',
    'strongly_under': 'Weak'
  };
  const colors = {
    'strongly_over': 'badge-green',
    'slightly_over': 'badge-green',
    'neutral': 'badge-yellow',
    'slightly_under': 'badge-red',
    'strongly_under': 'badge-red'
  };
  const label = labels[health] || 'Unknown';
  const cls = colors[health] || 'badge-yellow';
  const ciText = data.ci_lower != null ? `Wilson CI: ${data.ci_lower.toFixed(1)}%` : '';
  const title = `Meta health vs 50% baseline. ${ciText}`;
  return `<div class="stat-box"><div class="val"><span class="badge ${cls}">${label}</span></div><div class="lbl" title="${title}">Meta Health</div></div>`;
}

function heroHtml(data) {
  const wrCls  = wrClass(data.win_rate);
  const eventLabel = data.event_type === "all" ? "all events" : data.event_type + " events";
  return `
    <div class="hero">
      <div style="flex:1;">
        <h2>${data.faction}</h2>
        <div class="meta">${data.window_days}-day window · as of ${data.as_of} · ${eventLabel}</div>
      </div>
      <div class="hero-stats">
        <div class="stat-box">
          <div class="val"><span class="${wrCls}">${data.win_rate.toFixed(1)}%</span></div>
          <div class="lbl" title="Win rate across all games in the window (draw = 0.5 win)">Win Rate</div>
        </div>
        ${metaHealthBadge(data)}
        <div class="stat-box">
          <div class="val">${data.play_rate.toFixed(1)}%</div>
          <div class="lbl" title="Share of all lists in the window playing this faction">Play Rate</div>
        </div>
        <div class="stat-box">
          <div class="val">${data.lists.toLocaleString()}</div>
          <div class="lbl">Lists</div>
        </div>
        <div class="stat-box">
          <div class="val">${data.games.toLocaleString()}</div>
          <div class="lbl">Games</div>
        </div>
        <div class="stat-box">
          <div class="val">${trendHtml(data.trend_delta)}</div>
          <div class="lbl" title="Win-rate change vs the previous ${data.window_days}-day window">Trend</div>
        </div>
        <div class="stat-box">
          <div class="val">${(data.x0_pct || 0).toFixed(1)}%</div>
          <div class="lbl" title="% of lists that went undefeated (0 losses, 0 draws)">X-0 Rate</div>
        </div>
        <div class="stat-box">
          <div class="val">${(data.x1_pct || 0).toFixed(1)}%</div>
          <div class="lbl" title="% of lists with exactly 1 loss">X-1 Rate</div>
        </div>
        <div class="stat-box">
          <div class="val">${data.tournament_wins || 0}</div>
          <div class="lbl" title="Number of tournament wins (1st place finishes)">T.Wins</div>
        </div>
      </div>
    </div>`;
}

function detachmentTable(dets) {
  if (!dets || !dets.length) return `<p class="empty">No detachment data.</p>`;
  const rows = dets.map(d => {
    const x0_pct = d.x0_pct != null ? d.x0_pct.toFixed(1) + '%' : '—';
    const x1_pct = d.x1_pct != null ? d.x1_pct.toFixed(1) + '%' : '—';
    return `
    <tr>
      <td>${d.detachment || d.base_archetype || "—"}</td>
      <td data-sort="${d.lists}">${d.lists}</td>
      <td data-sort="${d.play_rate}" title="Share of this faction's players using this detachment">${d.play_rate.toFixed(1)}%</td>
      <td data-sort="${d.win_rate}"><span class="${wrClass(d.win_rate)}">${d.win_rate.toFixed(1)}%</span></td>
      <td data-sort="${d.x0_pct ?? -999}" title="Percentage of players going undefeated with this detachment">${x0_pct}</td>
      <td data-sort="${d.x1_pct ?? -999}" title="Percentage of players with exactly 1 loss using this detachment">${x1_pct}</td>
      <td data-sort="${d.games}">${d.games}</td>
      <td data-sort="${d.tournament_wins || 0}">${d.tournament_wins || 0}</td>
    </tr>`;
  }).join("");
  return `
    <table>
      <thead><tr>
        <th>Detachment</th>
        <th title="Number of players using this detachment in the window">Players</th>
        <th title="Share of this faction's players using this detachment">Play %</th>
        <th title="Win rate for this detachment (draw = 0.5 win)">Win %</th>
        <th title="Percentage of players going undefeated with this detachment">X-0 %</th>
        <th title="Percentage of players with exactly 1 loss using this detachment">X-1 %</th>
        <th title="Total games played with this detachment">Games</th>
        <th title="Number of tournament wins (1st place) with this detachment">T.Wins</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function dispositionTable(disps) {
  if (!disps || !disps.length) return `<p class="empty">No disposition data (11th Edition only).</p>`;
  const rows = disps.map(d => {
    const x0_pct = d.x0_pct != null ? d.x0_pct.toFixed(1) + '%' : '—';
    const x1_pct = d.x1_pct != null ? d.x1_pct.toFixed(1) + '%' : '—';
    return `
    <tr>
      <td>${d.disposition || "—"}</td>
      <td data-sort="${d.lists}">${d.lists}</td>
      <td data-sort="${d.play_rate}" title="Share of this faction's players using this disposition">${d.play_rate.toFixed(1)}%</td>
      <td data-sort="${d.win_rate}"><span class="${wrClass(d.win_rate)}">${d.win_rate.toFixed(1)}%</span></td>
      <td data-sort="${d.x0_pct ?? -999}" title="Percentage of players going undefeated with this disposition">${x0_pct}</td>
      <td data-sort="${d.x1_pct ?? -999}" title="Percentage of players with exactly 1 loss using this disposition">${x1_pct}</td>
      <td data-sort="${d.games}">${d.games}</td>
    </tr>`;
  }).join("");
  return `
    <table>
      <thead><tr>
        <th>Disposition</th>
        <th title="Number of players using this disposition in the window">Players</th>
        <th title="Share of this faction's players using this disposition">Play %</th>
        <th title="Win rate for this disposition (draw = 0.5 win)">Win %</th>
        <th title="Percentage of players going undefeated with this disposition">X-0 %</th>
        <th title="Percentage of players with exactly 1 loss using this disposition">X-1 %</th>
        <th title="Total games played with this disposition">Games</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function playersTable(players) {
  if (!players || !players.length) return `<p class="empty">No player data available (min 3 games required).</p>`;
  // Check if any player has dispositions (11th edition only)
  const hasDispositions = players.some(p => p.disposition);

  const rows = players.map((p, i) => {
    const linkHtml = p.list_url
      ? `<a class="list-link" href="${p.list_url}" target="_blank" rel="noopener">View List ↗</a>`
      : `<span style="color:var(--dim);font-size:0.78rem">${p.source || "—"}</span>`;
    const dispCell = hasDispositions
      ? `<td style="color:var(--dim);font-size:0.8rem">${p.disposition || "—"}</td>`
      : '';
    return `
      <tr>
        <td style="color:var(--dim);font-size:0.8rem">${i + 1}</td>
        <td>${p.player_name}</td>
        <td data-sort="${p.win_rate}"><span class="${wrClass(p.win_rate)}">${p.win_rate.toFixed(1)}%</span></td>
        <td>${p.wins}–${p.losses}${p.draws ? `–${p.draws}` : ""}</td>
        <td style="color:var(--dim);font-size:0.8rem">${p.detachment || "—"}</td>
        ${dispCell}
        <td>${linkHtml}</td>
      </tr>`;
  }).join("");

  const dispHeader = hasDispositions
    ? '<th title="Force Disposition (11th Edition)">Disposition</th>'
    : '';

  return `
    <table>
      <thead><tr>
        <th>#</th>
        <th>Player</th>
        <th title="Win rate across games in the window (draw = 0.5 win)">Win %</th>
        <th>Record</th>
        <th>Detachment</th>
        ${dispHeader}
        <th>List</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function timelineTable(timeline) {
  if (!timeline || !timeline.length) return '<p class="empty">No timeline data.</p>';
  const rows = timeline.map(t => `
    <tr>
      <td>${t.week}</td>
      <td data-sort="${t.lists}">${t.lists}</td>
      <td data-sort="${t.play_rate || 0}">${t.play_rate != null ? t.play_rate.toFixed(1) + '%' : '—'}</td>
      <td data-sort="${t.win_rate || 0}"><span class="${t.win_rate != null ? wrClass(t.win_rate) : ''}">${t.win_rate != null ? t.win_rate.toFixed(1) + '%' : '—'}</span></td>
      <td data-sort="${t.games}">${t.games}</td>
    </tr>`).join('');
  return `
    <table>
      <thead><tr>
        <th>Week</th>
        <th title="Number of lists played this week">Lists</th>
        <th title="Share of all lists this week">Rep %</th>
        <th title="Win rate this week">Win %</th>
        <th title="Total games this week">Games</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderDetChart(dets) {
  if (typeof Plotly === "undefined" || !dets || !dets.length) return;
  const top = [...dets].sort((a, b) => b.play_rate - a.play_rate).slice(0, 15);
  Plotly.react("chart-det", [{
    type: "bar",
    orientation: "h",
    y: top.map(d => (d.detachment || "Unknown").replace(/^.+ — /, "")).reverse(),
    x: top.map(d => d.play_rate).reverse(),
    marker: { color: "#1565c0" },
    text: top.map(d => `${d.play_rate.toFixed(1)}%`).reverse(),
    textposition: "outside",
    cliponaxis: false,
    hovertemplate: "%{y}: %{x:.1f}%<extra></extra>",
  }], darkLayout({ margin: { t: 20, r: 80, b: 30, l: 180 } }), plotlyConfig());
}

function renderDispChart(disps) {
  if (typeof Plotly === "undefined" || !disps || !disps.length) return;
  const sorted = [...disps].sort((a, b) => b.play_rate - a.play_rate);
  Plotly.react("chart-disp", [{
    type: "bar",
    orientation: "h",
    y: sorted.map(d => d.disposition || "Unknown").reverse(),
    x: sorted.map(d => d.play_rate).reverse(),
    marker: { color: "#e94560" },
    text: sorted.map(d => `${d.play_rate.toFixed(1)}%`).reverse(),
    textposition: "outside",
    cliponaxis: false,
    hovertemplate: "%{y}: %{x:.1f}%<extra></extra>",
  }], darkLayout({ margin: { t: 20, r: 80, b: 30, l: 180 } }), plotlyConfig());
}

function renderMatchupChart(matchups) {
  if (typeof Plotly === "undefined" || !matchups || !matchups.length) return;
  const sorted = [...matchups].sort((a, b) => b.win_rate - a.win_rate);
  Plotly.react("chart-matchup", [{
    type: "bar",
    orientation: "h",
    y: sorted.map(m => m.opponent_faction).reverse(),
    x: sorted.map(m => m.win_rate).reverse(),
    marker: { color: sorted.map(m => plotlyWrColor(m.win_rate)).reverse() },
    text: sorted.map(m => `${m.win_rate.toFixed(1)}% (n=${m.games})`).reverse(),
    textposition: "outside",
    cliponaxis: false,
    hovertemplate: "vs %{y}: %{x:.1f}%<extra></extra>",
  }], darkLayout({
    margin: { t: 20, r: 120, b: 30, l: 200 },
    xaxis: {
      range: [0, 95],
      gridcolor: "#2a2a4a",
      zerolinecolor: "#2a2a4a",
    },
    shapes: [{ type: "line", x0: 50, x1: 50, y0: -0.5, y1: sorted.length - 0.5,
               line: { color: "#555", width: 1, dash: "dot" } }],
  }), plotlyConfig());
}

function renderDetPieChart(dets, metric = 'lists') {
  if (typeof Plotly === "undefined" || !dets || !dets.length) return;

  // Define metric configurations
  const metrics = {
    lists: {
      label: 'Lists',
      getValue: d => d.lists,
      hoverTemplate: "%{label}<br>%{value} lists (%{percent})<extra></extra>",
      sortDesc: true
    },
    play_rate: {
      label: 'Play Rate',
      getValue: d => d.play_rate,
      hoverTemplate: "%{label}<br>%{value:.1f}% (%{percent})<extra></extra>",
      sortDesc: true
    },
    win_rate: {
      label: 'Win Rate',
      getValue: d => d.win_rate,
      hoverTemplate: "%{label}<br>%{value:.1f}% WR (%{percent})<extra></extra>",
      sortDesc: true
    },
    tournament_wins: {
      label: 'Tournament Wins',
      getValue: d => d.tournament_wins || 0,
      hoverTemplate: "%{label}<br>%{value} wins (%{percent})<extra></extra>",
      sortDesc: true
    }
  };

  const config = metrics[metric] || metrics.lists;
  const sorted = [...dets].sort((a, b) =>
    config.sortDesc
      ? config.getValue(b) - config.getValue(a)
      : config.getValue(a) - config.getValue(b)
  );
  const top = sorted.slice(0, 10);

  Plotly.react("chart-det-pie", [{
    type: "pie",
    labels: top.map(d => d.detachment || "Unknown"),
    values: top.map(d => config.getValue(d)),
    textinfo: "percent",
    textposition: "inside",
    insidetextorientation: "horizontal",
    marker: {
      colors: ['#1565c0','#42a5f5','#e94560','#4caf50','#ffb300','#ff7043','#8bc34a','#e53935','#7e57c2','#26c6da']
    },
    hovertemplate: config.hoverTemplate,
    pull: top.map((_, i) => i === 0 ? 0.05 : 0),
  }], darkLayout({
    margin: { t: 40, r: 20, b: 20, l: 20 },
    showlegend: true,
    legend: {
      font: { color: '#eaeaea', size: 9 },
      orientation: 'v',
      x: 1.02,
      y: 0.5,
      xanchor: 'left',
      yanchor: 'middle'
    },
  }), plotlyConfig());
}

function renderTimeline(timeline) {
  if (typeof Plotly === "undefined" || !timeline || !timeline.length) return;

  Plotly.react("chart-lists", [{
    type: "scatter", mode: "lines+markers",
    x: timeline.map(t => t.week),
    y: timeline.map(t => t.lists),
    line: { color: "#1565c0" },
    hovertemplate: "%{x}: %{y} lists<extra></extra>",
  }], darkLayout({ margin: { t: 10, r: 20, b: 40, l: 50 } }), plotlyConfig());

  Plotly.react("chart-wr-timeline", [{
    type: "scatter", mode: "lines+markers",
    x: timeline.filter(t => t.win_rate !== null).map(t => t.week),
    y: timeline.filter(t => t.win_rate !== null).map(t => t.win_rate),
    line: { color: "#e94560" },
    hovertemplate: "%{x}: %{y:.1f}%<extra></extra>",
  }], darkLayout({
    margin: { t: 10, r: 20, b: 40, l: 50 },
    yaxis: { range: [30, 80], gridcolor: "#2a2a4a" },
    shapes: [{ type: "line", x0: 0, x1: 1, xref: "paper", y0: 50, y1: 50,
               line: { color: "#555", width: 1, dash: "dot" } }],
  }), plotlyConfig());
}

async function loadRankings(eventType, windowDays, currentFaction) {
  try {
    const factions = await fetchJSON(`${dataRoot(eventType, windowDays)}/factions.json`);
    const metrics = ['lists', 'games', 'win_rate', 'play_rate', 'x0_pct', 'x1_pct', 'tournament_wins'];
    const rankings = {};
    const total = factions.length;
    for (const metric of metrics) {
      const sorted = [...factions].sort((a, b) => (b[metric] || 0) - (a[metric] || 0));
      const rank = sorted.findIndex(f => f.faction === currentFaction) + 1;
      const value = sorted.find(f => f.faction === currentFaction)?.[metric] || 0;
      rankings[metric] = { rank, total, value };
    }
    return rankings;
  } catch (e) {
    console.error('Failed to load rankings:', e);
    return null;
  }
}

function rankingsTable(rankings) {
  if (!rankings) return '<p class="empty">Rankings unavailable.</p>';
  const labels = {
    lists: 'Total Players',
    games: 'Total Games',
    win_rate: 'Win Rate',
    play_rate: 'Representation',
    x0_pct: 'X-0 Rate',
    x1_pct: 'X-1 Rate',
    tournament_wins: 'Tournament Wins'
  };
  const rows = Object.entries(labels).map(([key, label]) => {
    const r = rankings[key];
    if (!r) return '';
    const rankCls = r.rank <= 3 ? 'style="color:#4caf50;font-weight:600"' : r.rank > r.total - 3 ? 'style="color:#e53935"' : '';
    return `<tr><td>${label}</td><td ${rankCls}><strong>#${r.rank}</strong> / ${r.total}</td></tr>`;
  }).join('');
  return `<table class="ranking-table"><thead><tr><th>Metric</th><th>Rank</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderFactionMap(factionName, mapData) {
  // Filter to events where this faction was played
  const events = mapData.filter(e => e.factions && e.factions.includes(factionName));

  if (events.length === 0) {
    document.getElementById("map-chart").innerHTML =
      '<div style="padding:2rem;text-align:center;color:var(--dim);">No tournaments with location data for this faction</div>';
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
        factionPlayers: 0,  // Count of THIS faction's players
        // For faction page, track other factions for context
        otherFactions: new Map(),
      });
    }
    const loc = locationMap.get(key);
    loc.tournaments.push(e.name);

    // Add THIS faction's player count from this event
    if (e.faction_counts && e.faction_counts[factionName]) {
      loc.factionPlayers += e.faction_counts[factionName];
    }

    // Track other faction counts (exclude current faction and Unknown)
    if (e.faction_counts) {
      Object.entries(e.faction_counts).forEach(([f, count]) => {
        if (f !== 'Unknown' && f !== factionName) {
          loc.otherFactions.set(f, (loc.otherFactions.get(f) || 0) + count);
        }
      });
    }
  });

  // Convert to array and compute top other factions
  const locations = Array.from(locationMap.values()).map(loc => {
    const topOtherFactions = Array.from(loc.otherFactions.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([faction]) => faction);
    return { ...loc, topOtherFactions };
  });

  const trace = {
    type: 'scattergeo',
    lat: locations.map(loc => loc.lat),
    lon: locations.map(loc => loc.lng),
    text: locations.map(loc => {
      const topFactionsStr = loc.topOtherFactions.length > 0
        ? `<br>Common opponents: ${loc.topOtherFactions.join(', ')}`
        : '';
      return `${loc.location}<br>${loc.tournaments.length} tournament${loc.tournaments.length > 1 ? 's' : ''}<br>${loc.factionPlayers} ${factionName} player${loc.factionPlayers !== 1 ? 's' : ''}${topFactionsStr}`;
    }),
    hoverinfo: 'text',
    marker: {
      size: locations.map(loc => Math.max(8, Math.sqrt(loc.tournaments.length) * 8 + Math.sqrt(loc.factionPlayers) * 0.8)),
      color: '#e94560',
      opacity: 0.8,
      line: { width: 0.5, color: '#fff' }
    },
    mode: 'markers',
  };

  const layout = {
    geo: {
      projection: { type: 'natural earth' },
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
    height: 400,
  };

  const config = plotlyConfig({
    toImageButtonOptions: {
      format: 'png',
      filename: `${factionName.replace(/[^a-z0-9]/gi, '_')}_locations`,
      height: 800,
      width: 1400,
    }
  });

  Plotly.newPlot('map-chart', [trace], layout, config);
}

init();
