/* Disposition detail page */

let dispositionData = null;
let dispositionManifest = null;
let currentEventType = getEventType();
let currentWindow = getWindow();
let currentDisposition = getDisposition();

function getDisposition() {
  const params = new URLSearchParams(window.location.search);
  return params.get("d") || "purge_the_foe";
}

function dispositionDisplayName(slug) {
  return slug
    .split("_")
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function dispositionSlug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

async function loadData(eventType, windowDays, dispositionSlugStr) {
  const backUrl = `dispositions.html?event_type=${encodeURIComponent(eventType)}&window=${encodeURIComponent(windowDays)}`;
  const root = dataRoot(eventType, windowDays);

  try {
    dispositionData = await fetchJSON(`${root}/disposition/${dispositionSlugStr}.json`);
  } catch (e) {
    document.getElementById("content").innerHTML =
      `<p class="empty" style="color:var(--red)">
        No data available for ${dispositionDisplayName(dispositionSlugStr)} in the ${windowDays} ${eventType} window.
        <br><span style="color:var(--dim);font-size:0.9em">There may be no tournaments in this time period.</span>
        <br><a href="${backUrl}">← Back to dispositions</a>
      </p>`;
    return false;
  }

  try {
    dispositionManifest = await fetchJSON(`${root}/index.json`);
  } catch (_) {
    dispositionManifest = {};
  }

  return true;
}

function formatAvgVp(vp) {
  if (vp == null) return "—";
  return Number.isInteger(vp) ? `${vp} pts` : `${vp.toFixed(1)} pts`;
}

function renderHero() {
  const d = dispositionData;
  const name = d.disposition || dispositionDisplayName(currentDisposition);
  const wrCls = wrClass(d.win_rate ?? 0);
  const eventLabel = (d.event_type || currentEventType) === "all"
    ? "all events"
    : (d.event_type || currentEventType) + " events";
  const windowDays = d.window_days || parseInt(currentWindow, 10);
  const asOf = d.as_of || dispositionManifest?.as_of || "";

  document.title = `${name} — Informed Crusader`;
  const crumb = document.getElementById("breadcrumb-disposition");
  if (crumb) crumb.textContent = name;
  document.getElementById("window-label").textContent =
    `${name} · ${windowDays}-day window${asOf ? " · as of " + asOf : ""}`;

  const content = document.getElementById("content");
  content.className = "";
  content.innerHTML = `
    <div class="hero">
      <div style="flex:1;">
        <h2>${name}</h2>
        <div class="meta">${windowDays}-day window${asOf ? " · as of " + asOf : ""} · ${eventLabel}</div>
      </div>
      <div class="hero-stats">
        <div class="stat-box">
          <div class="val">${(d.lists ?? 0).toLocaleString()}</div>
          <div class="lbl">Lists</div>
        </div>
        <div class="stat-box">
          <div class="val">${(d.games ?? 0).toLocaleString()}</div>
          <div class="lbl">Games</div>
        </div>
        <div class="stat-box">
          <div class="val"><span class="${wrCls}">${(d.win_rate ?? 0).toFixed(1)}%</span></div>
          <div class="lbl" title="Win rate across all games in the window (draw = 0.5 win)">Win Rate</div>
        </div>
        <div class="stat-box">
          <div class="val">${formatAvgVp(d.avg_vp)}</div>
          <div class="lbl" title="Average victory points scored">Avg VP</div>
        </div>
        <div class="stat-box">
          <div class="val">${(d.x0_pct ?? 0).toFixed(1)}%</div>
          <div class="lbl" title="% of lists that went undefeated (0 losses, 0 draws)">X-0 Rate</div>
        </div>
        <div class="stat-box">
          <div class="val">${(d.x1_pct ?? 0).toFixed(1)}%</div>
          <div class="lbl" title="% of lists with exactly 1 loss">X-1 Rate</div>
        </div>
      </div>
    </div>

    <p class="section-title">Factions Using This Disposition</p>
    <div class="panel">
      <div class="panel-title">Faction Breakdown</div>
      <div class="table-wrap" id="factions-table-wrap"></div>
    </div>

    <p class="section-title">Detachments Using This Disposition</p>
    <div class="panel">
      <div class="panel-title">Detachment Breakdown</div>
      <div class="table-wrap" id="detachments-table-wrap"></div>
    </div>

    <p class="section-title">Matchups vs Other Dispositions</p>
    <div class="panel">
      <div class="panel-title">Win Rate by Opponent Disposition</div>
      <div class="table-wrap" id="matchups-table-wrap"></div>
    </div>

    <p class="section-title">Top Players</p>
    <div class="panel">
      <div class="panel-title">Top Players with this Disposition <span class="panel-note">(min 3 games)</span></div>
      <div class="table-wrap" id="players-table-wrap"></div>
    </div>
  `;

  renderFooter(dispositionManifest);
}

function factionsTableHtml(factions) {
  if (!factions || !factions.length) return '<p class="empty">No data available.</p>';
  const rows = factions.map(f => {
    const slug = f.slug || factionSlug(f.faction || "");
    const playRate = f.play_rate ?? 0;
    const winRate = f.win_rate ?? 0;
    const x0 = f.x0_pct;
    return `
      <tr>
        <td><a href="faction.html?faction=${encodeURIComponent(slug)}">${f.faction || "—"}</a></td>
        <td data-sort="${f.lists ?? 0}">${(f.lists ?? 0).toLocaleString()}</td>
        <td data-sort="${f.games ?? 0}">${(f.games ?? 0).toLocaleString()}</td>
        <td data-sort="${playRate}">${playRate.toFixed(1)}%</td>
        <td data-sort="${winRate}"><span class="${wrClass(winRate)}">${winRate.toFixed(1)}%</span></td>
        <td data-sort="${x0 ?? -999}">${x0 != null ? x0.toFixed(1) + '%' : '—'}</td>
      </tr>`;
  }).join("");
  return `
    <table>
      <thead><tr>
        <th>Faction</th>
        <th title="Number of lists using this disposition">Lists</th>
        <th title="Total games played with this disposition">Games</th>
        <th title="Share of this disposition's lists from this faction">Play %</th>
        <th title="Win rate for this faction using this disposition">Win %</th>
        <th title="Percentage of lists going undefeated">X-0 %</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderFactionsTable() {
  const wrap = document.getElementById("factions-table-wrap");
  if (!wrap) return;
  wrap.innerHTML = factionsTableHtml(dispositionData.factions);
}

function detachmentsTableHtml(detachments) {
  if (!detachments || !detachments.length) return '<p class="empty">No data available.</p>';
  const rows = detachments.map(d => {
    const playRate = d.play_rate ?? 0;
    const winRate = d.win_rate ?? 0;
    const x0 = d.x0_pct;
    return `
      <tr>
        <td>${d.base_archetype || d.detachment || "—"}</td>
        <td data-sort="${d.lists ?? 0}">${(d.lists ?? 0).toLocaleString()}</td>
        <td data-sort="${d.games ?? 0}">${(d.games ?? 0).toLocaleString()}</td>
        <td data-sort="${playRate}">${playRate.toFixed(1)}%</td>
        <td data-sort="${winRate}"><span class="${wrClass(winRate)}">${winRate.toFixed(1)}%</span></td>
        <td data-sort="${x0 ?? -999}">${x0 != null ? x0.toFixed(1) + '%' : '—'}</td>
      </tr>`;
  }).join("");
  return `
    <table>
      <thead><tr>
        <th>Detachment</th>
        <th title="Number of lists with this detachment using this disposition">Lists</th>
        <th title="Total games played">Games</th>
        <th title="Share of this disposition's lists from this detachment">Play %</th>
        <th title="Win rate for this detachment using this disposition">Win %</th>
        <th title="Percentage of lists going undefeated">X-0 %</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderDetachmentsTable() {
  const wrap = document.getElementById("detachments-table-wrap");
  if (!wrap) return;
  wrap.innerHTML = detachmentsTableHtml(dispositionData.detachments);
}

function matchupsTableHtml(matchups) {
  if (!matchups || !matchups.length) return '<p class="empty">No matchup data available.</p>';
  const sorted = [...matchups].sort((a, b) => (b.win_rate ?? 0) - (a.win_rate ?? 0));
  const rows = sorted.map(m => {
    const winRate = m.win_rate ?? 0;
    const opp = m.opponent_disposition || m.disposition || "—";
    return `
      <tr>
        <td>${opp}</td>
        <td data-sort="${m.games ?? 0}">${(m.games ?? 0).toLocaleString()}</td>
        <td data-sort="${m.wins ?? 0}">${(m.wins ?? 0).toLocaleString()}</td>
        <td data-sort="${winRate}"><span class="${wrClass(winRate)}">${winRate.toFixed(1)}%</span></td>
      </tr>`;
  }).join("");
  return `
    <table>
      <thead><tr>
        <th>Opponent Disposition</th>
        <th title="Total games into this opponent disposition">Games</th>
        <th title="Wins (draws counted as 0.5)">Wins</th>
        <th title="Win rate vs this opponent disposition">Win %</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderMatchupsTable() {
  const wrap = document.getElementById("matchups-table-wrap");
  if (!wrap) return;
  wrap.innerHTML = matchupsTableHtml(dispositionData.matchups);
}

function playersTableHtml(players) {
  if (!players || !players.length) return '<p class="empty">No player data available (min 3 games required).</p>';
  const rows = players.map((p, i) => {
    const winRate = p.win_rate ?? 0;
    const rating = p.rating != null ? Math.round(p.rating) : "—";
    return `
      <tr>
        <td style="color:var(--dim);font-size:0.8rem">${i + 1}</td>
        <td><a href="players.html">${p.player_name || "—"}</a></td>
        <td data-sort="${p.rating ?? 0}">${rating}</td>
        <td data-sort="${p.games ?? 0}">${p.games ?? 0}</td>
        <td data-sort="${winRate}"><span class="${wrClass(winRate)}">${winRate.toFixed(1)}%</span></td>
      </tr>`;
  }).join("");
  return `
    <table>
      <thead><tr>
        <th>#</th>
        <th>Player</th>
        <th title="Player rating">Rating</th>
        <th title="Games played with this disposition">Games</th>
        <th title="Win rate (draw = 0.5 win)">Win %</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderTopPlayersTable() {
  const wrap = document.getElementById("players-table-wrap");
  if (!wrap) return;
  wrap.innerHTML = playersTableHtml(dispositionData.top_players);
}

function render() {
  renderHero();
  renderFactionsTable();
  renderDetachmentsTable();
  renderMatchupsTable();
  renderTopPlayersTable();

  requestAnimationFrame(() => {
    document.querySelectorAll("table").forEach(makeSortable);
  });
}

function syncActiveButtons() {
  document.querySelectorAll("#event-type-btns .btn").forEach(b => {
    b.classList.toggle("active", b.dataset.val === currentEventType);
  });
  document.querySelectorAll("#window-btns .btn").forEach(b => {
    b.classList.toggle("active", b.dataset.val === currentWindow);
  });
}

function updateBackLinks() {
  const backUrl = `dispositions.html?event_type=${encodeURIComponent(currentEventType)}&window=${encodeURIComponent(currentWindow)}`;
  const backLink = document.getElementById("back-link");
  const breadcrumbBack = document.getElementById("breadcrumb-back");
  if (backLink) backLink.href = backUrl;
  if (breadcrumbBack) breadcrumbBack.href = backUrl;
}

function wireFilterButtons() {
  document.querySelectorAll("#window-btns .btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const newWindow = btn.dataset.val;
      if (newWindow === currentWindow) return;
      currentWindow = newWindow;
      syncActiveButtons();

      const url = new URL(window.location);
      url.searchParams.set("window", newWindow);
      history.replaceState(null, "", url);

      const ok = await loadData(currentEventType, currentWindow, currentDisposition);
      updateBackLinks();
      if (ok) render();
    });
  });

  document.querySelectorAll("#event-type-btns .btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const newType = btn.dataset.val;
      if (newType === currentEventType) return;
      currentEventType = newType;
      syncActiveButtons();

      const url = new URL(window.location);
      url.searchParams.set("event_type", newType);
      history.replaceState(null, "", url);

      const ok = await loadData(currentEventType, currentWindow, currentDisposition);
      updateBackLinks();
      if (ok) render();
    });
  });
}

async function init() {
  syncActiveButtons();
  updateBackLinks();
  const ok = await loadData(currentEventType, currentWindow, currentDisposition);
  if (ok) render();
  wireFilterButtons();
}

document.addEventListener("DOMContentLoaded", init);
