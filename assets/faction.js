/* Faction detail page */

let currentSlug = "";
let currentEventType = getEventType();
let currentWindow = getWindow();

async function loadFactionData(slug, eventType, windowDays) {
  const backUrl = `index.html?event_type=${encodeURIComponent(eventType)}&window=${encodeURIComponent(windowDays)}`;

  let data;
  try {
    data = await fetchJSON(`${dataRoot(eventType, windowDays)}/faction/${slug}.json`);
  } catch (e) {
    // Try fallback to "all" / "30d" bundle
    if (eventType !== "all" || windowDays !== "30d") {
      try {
        data = await fetchJSON(`${dataRoot("all", "30d")}/faction/${slug}.json`);
      } catch (_) {}
    }
    if (!data) {
      document.getElementById("content").innerHTML =
        `<p class="empty" style="color:var(--red)">
          Could not load faction data for "${slug}": ${e.message}
          <br><a href="${backUrl}">← Back to explorer</a>
        </p>`;
      return null;
    }
  }

  let manifest = {};
  try { manifest = await fetchJSON(`${dataRoot(eventType, windowDays)}/index.json`); } catch (_) {}

  return { data, manifest, backUrl };
}

function renderFactionPage(result) {
  if (!result) return;

  const { data, manifest, backUrl } = result;

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
  content.innerHTML = `
    ${heroHtml(data)}
    <p class="section-title">Detachments</p>
    <div class="two-col">
      <div class="panel">
        <div class="panel-title">Detachment Breakdown</div>
        <div class="table-wrap">${detachmentTable(data.detachments)}</div>
      </div>
      <div class="chart-wrap">
        <div class="panel-title">Play Rate by Detachment</div>
        <div id="chart-det" class="chart-det"></div>
      </div>
    </div>

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
  `;

  renderFooter(manifest);

  // Render charts after DOM is built
  requestAnimationFrame(() => {
    renderDetChart(data.detachments);
    renderMatchupChart(data.matchups);
    renderTimeline(data.timeline);
    document.querySelectorAll("table").forEach(makeSortable);
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
      </div>
    </div>`;
}

function detachmentTable(dets) {
  if (!dets || !dets.length) return `<p class="empty">No detachment data.</p>`;
  const rows = dets.map(d => `
    <tr>
      <td>${d.detachment || d.base_archetype || "—"}</td>
      <td data-sort="${d.lists}">${d.lists}</td>
      <td data-sort="${d.play_rate}" title="Share of this faction's lists using this detachment">${d.play_rate.toFixed(1)}%</td>
      <td data-sort="${d.win_rate}"><span class="${wrClass(d.win_rate)}">${d.win_rate.toFixed(1)}%</span></td>
      <td data-sort="${d.games}">${d.games}</td>
    </tr>`).join("");
  return `
    <table>
      <thead><tr>
        <th>Detachment</th>
        <th title="Number of lists using this detachment in the window">Lists</th>
        <th title="Share of this faction's lists using this detachment">Play %</th>
        <th title="Win rate for this detachment (draw = 0.5 win)">Win %</th>
        <th title="Total games played with this detachment">Games</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function playersTable(players) {
  if (!players || !players.length) return `<p class="empty">No player data available (min 3 games required).</p>`;
  const rows = players.map((p, i) => {
    const linkHtml = p.list_url
      ? `<a class="list-link" href="${p.list_url}" target="_blank" rel="noopener">View List ↗</a>`
      : `<span style="color:var(--dim);font-size:0.78rem">${p.source || "—"}</span>`;
    return `
      <tr>
        <td style="color:var(--dim);font-size:0.8rem">${i + 1}</td>
        <td>${p.player_name}</td>
        <td data-sort="${p.win_rate}"><span class="${wrClass(p.win_rate)}">${p.win_rate.toFixed(1)}%</span></td>
        <td>${p.wins}–${p.losses}${p.draws ? `–${p.draws}` : ""}</td>
        <td style="color:var(--dim);font-size:0.8rem">${p.detachment || "—"}</td>
        <td>${linkHtml}</td>
      </tr>`;
  }).join("");
  return `
    <table>
      <thead><tr>
        <th>#</th>
        <th>Player</th>
        <th title="Win rate across games in the window (draw = 0.5 win)">Win %</th>
        <th>Record</th>
        <th>Detachment</th>
        <th>List</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderDetChart(dets) {
  if (typeof Plotly === "undefined" || !dets || !dets.length) return;
  const top = [...dets].sort((a, b) => b.play_rate - a.play_rate).slice(0, 15);
  Plotly.newPlot("chart-det", [{
    type: "bar",
    orientation: "h",
    y: top.map(d => (d.detachment || "Unknown").replace(/^.+ — /, "")).reverse(),
    x: top.map(d => d.play_rate).reverse(),
    marker: { color: "#1565c0" },
    text: top.map(d => `${d.play_rate.toFixed(1)}%`).reverse(),
    textposition: "outside",
    cliponaxis: false,
    hovertemplate: "%{y}: %{x:.1f}%<extra></extra>",
  }], darkLayout({ margin: { t: 20, r: 80, b: 30, l: 180 } }), { responsive: true });
}

function renderMatchupChart(matchups) {
  if (typeof Plotly === "undefined" || !matchups || !matchups.length) return;
  const sorted = [...matchups].sort((a, b) => b.win_rate - a.win_rate);
  Plotly.newPlot("chart-matchup", [{
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
  }), { responsive: true });
}

function renderTimeline(timeline) {
  if (typeof Plotly === "undefined" || !timeline || !timeline.length) return;

  Plotly.newPlot("chart-lists", [{
    type: "scatter", mode: "lines+markers",
    x: timeline.map(t => t.week),
    y: timeline.map(t => t.lists),
    line: { color: "#1565c0" },
    hovertemplate: "%{x}: %{y} lists<extra></extra>",
  }], darkLayout({ margin: { t: 10, r: 20, b: 40, l: 50 } }), { responsive: true });

  Plotly.newPlot("chart-wr-timeline", [{
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
  }), { responsive: true });
}

init();
