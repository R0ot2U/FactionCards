/* Country detail page. */

let currentSlug = "";
let currentEventType = getEventType();

async function loadCountryData(slug, eventType) {
  try {
    const data = await fetchJSON(`data/${eventType}/country/${slug}.json`);
    const manifest = await fetchJSON(dataRoot(eventType, "7d") + "/index.json").catch(() => ({}));
    return { data, manifest, usedFallback: false };
  } catch (e) {
    if (eventType !== "all") {
      try {
        const data = await fetchJSON(`data/all/country/${slug}.json`);
        const manifest = await fetchJSON(dataRoot("all", "7d") + "/index.json").catch(() => ({}));
        return { data, manifest, usedFallback: true };
      } catch (_) {}
    }
    return null;
  }
}

function factionHref(faction) {
  const slug = faction.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  return `faction.html?faction=${encodeURIComponent(slug)}`;
}

function playersTable(players) {
  if (!players || !players.length) return `<p class="empty">No players attributed to this country.</p>`;
  const rows = players.map(p => {
    const wrCls = wrClass(p.win_rate || 0);
    const record = `${p.wins || 0}-${p.losses || 0}` + (p.draws ? `-${p.draws}` : "");
    return `
      <tr>
        <td style="color:var(--dim);font-size:0.9rem">${p.rank || '—'}</td>
        <td>${p.player_name || 'Unknown'}</td>
        <td data-sort="${p.rating || 0}"><strong>${Math.round(p.rating || 0)}</strong></td>
        <td data-sort="${p.games || 0}">${p.games || 0}</td>
        <td data-sort="${p.win_rate || 0}" title="${record}"><span class="${wrCls}">${(p.win_rate || 0).toFixed(1)}%</span></td>
        <td style="color:var(--dim);font-size:0.8rem;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${p.factions || 'Unknown'}">${p.factions || 'Unknown'}</td>
      </tr>`;
  }).join("");
  return `
    <table id="country-players-table">
      <thead><tr>
        <th title="Rank by ELO rating">Rank</th>
        <th>Player</th>
        <th title="Current ELO rating">Rating</th>
        <th title="Games played">Games</th>
        <th title="Win rate (draw = 0.5 win)">Win %</th>
        <th>Factions</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function factionBreakdownTable(breakdown) {
  if (!breakdown || !breakdown.length) return `<p class="empty">No faction data for this country.</p>`;
  const rows = breakdown.map(f => {
    const wr = f.win_rate;
    const wrCell = wr == null ? '—' : `<span class="${wrClass(wr)}">${wr.toFixed(1)}%</span>`;
    return `
      <tr>
        <td><a class="faction-link" href="${factionHref(f.faction)}">${f.faction}</a></td>
        <td data-sort="${f.games || 0}">${f.games || 0}</td>
        <td data-sort="${wr ?? -999}">${wrCell}</td>
      </tr>`;
  }).join("");
  return `
    <table id="country-faction-table">
      <thead><tr>
        <th>Faction</th>
        <th title="Games played by this faction in this country's events">Games</th>
        <th title="Win rate for this faction in this country's events (draw = 0.5 win)">Win %</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderCountryPage(result) {
  const content = document.getElementById("content");
  if (!result) {
    content.innerHTML = `
      <p class="empty" style="color:var(--red)">
        No data available for this country.
        <br><a href="countries.html">← Back to country leaderboard</a>
      </p>`;
    return;
  }

  const { data, manifest, usedFallback } = result;

  document.title = `${data.country} — Informed Crusader`;
  document.getElementById("breadcrumb-country").textContent = data.country;
  document.getElementById("window-label").textContent = `${data.country} · all time`;

  const fallbackWarning = usedFallback
    ? `<div style="background:var(--yellow);color:#000;padding:12px 20px;margin:-10px -20px 20px;border-radius:6px;font-size:0.9em;">
         ⚠️ No data for this event type. Showing all-events data instead.
       </div>`
    : '';

  content.className = "";
  content.innerHTML = `
    ${fallbackWarning}
    <div class="hero">
      <div>
        <h2>${data.country}</h2>
        <div class="meta">${data.event_count} tournament${data.event_count === 1 ? '' : 's'} · all-time</div>
      </div>
      <div class="hero-stats">
        <div class="stat-box"><div class="val">${data.player_count}</div><div class="lbl">Players</div></div>
        <div class="stat-box"><div class="val">${Math.round(data.avg_rating || 0)}</div><div class="lbl">Avg Rating</div></div>
        <div class="stat-box"><div class="val"><span class="${wrClass(data.avg_win_rate || 0)}">${(data.avg_win_rate || 0).toFixed(1)}%</span></div><div class="lbl">Avg Win Rate</div></div>
        <div class="stat-box"><div class="val">${(data.total_games || 0).toLocaleString()}</div><div class="lbl">Games</div></div>
      </div>
    </div>

    <p class="section-title">Player Leaderboard</p>
    <div class="panel">
      <div class="panel-title">Players attributed to ${data.country} <span class="panel-note">(every country a player has competed in)</span></div>
      <div class="table-wrap">${playersTable(data.players)}</div>
    </div>

    <p class="section-title">Faction Breakdown</p>
    <div class="panel">
      <div class="panel-title">Factions played in ${data.country}'s events</div>
      <div class="table-wrap">${factionBreakdownTable(data.faction_breakdown)}</div>
    </div>
  `;

  renderFooter(manifest);
  document.querySelectorAll("#content table").forEach(makeSortable);
}

async function init() {
  const params = new URLSearchParams(window.location.search);
  currentSlug = params.get("c");

  if (!currentSlug) {
    document.getElementById("content").innerHTML =
      `<p class="empty">No country specified. <a href="countries.html">Return to country leaderboard.</a></p>`;
    return;
  }

  const result = await loadCountryData(currentSlug, currentEventType);
  renderCountryPage(result);

  document.querySelectorAll("#event-type-btns .btn").forEach(b => {
    b.classList.toggle("active", b.dataset.val === currentEventType);
  });

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

      const result = await loadCountryData(currentSlug, currentEventType);
      renderCountryPage(result);
    });
  });
}

init();
