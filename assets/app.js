/* Shared helpers for Informed Crusader interactive site */

const DEFAULT_EVENT_TYPE = "all";
const DEFAULT_WINDOW = "7d";
const SUPPORTED_WINDOWS = ["7d", "14d", "30d", "60d", "all"];

// Single source of truth for dataslate eras: value (URL param + data dir suffix),
// button label, optional badge text, and optional tooltip. Add a new entry here
// each time a dataslate lands — every consumer (era buttons, badges, messages)
// reads from this list instead of hardcoding era strings.
const DATASLATE_ERAS = [
  { value: "all", label: "All Eras" },
  { value: "launch", label: "Launch", title: "Pre-dataslate (before 2026-07-22)" },
  { value: "2026-07-22", label: "Dataslate 1", badge: "DS1", title: "First dataslate (2026-07-22 to 2026-08-25)" },
  { value: "2026-08-26", label: "Dataslate 2", badge: "DS2", title: "Second dataslate (2026-08-26+)" },
];

// Cache manifest loaded once on page load
let cacheManifest = null;

async function loadCacheManifest() {
  if (cacheManifest) return cacheManifest;
  try {
    // Always fetch manifest fresh (no cache) to get latest hashes
    const resp = await fetch(`data/cache_manifest.json?t=${Date.now()}`);
    if (resp.ok) {
      cacheManifest = await resp.json();
    }
  } catch (e) {
    console.warn("Failed to load cache manifest, falling back to date-based cache busting", e);
    cacheManifest = {}; // Empty manifest means use fallback
  }
  return cacheManifest;
}

function getEventType() {
  const params = new URLSearchParams(window.location.search);
  const et = params.get("event_type") || DEFAULT_EVENT_TYPE;
  return ["all", "solo", "team"].includes(et) ? et : DEFAULT_EVENT_TYPE;
}

function getWindow() {
  const params = new URLSearchParams(window.location.search);
  const w = params.get("window") || DEFAULT_WINDOW;
  return SUPPORTED_WINDOWS.includes(w) ? w : DEFAULT_WINDOW;
}

function getDataslateEra() {
  const params = new URLSearchParams(window.location.search);
  const era = params.get("dataslate_era") || "all";
  return DATASLATE_ERAS.some(e => e.value === era) ? era : "all";
}

// Badge HTML for a dataslate era (e.g. "DS1"), or "" if the era has no badge.
function eraBadgeHtml(era) {
  const meta = DATASLATE_ERAS.find(e => e.value === era);
  if (!meta || !meta.badge) return "";
  return `<span style="display:inline-block;background:var(--accent);color:var(--bg);font-size:0.65rem;padding:0.15rem 0.35rem;border-radius:3px;margin-left:0.5rem;font-weight:600;vertical-align:middle;" title="${meta.title || meta.label}">${meta.badge}</span>`;
}

// Display label for a dataslate era value (e.g. "2026-07-22" -> "Dataslate 1").
function eraLabel(era) {
  return DATASLATE_ERAS.find(e => e.value === era)?.label || era;
}

// Turn filter state (all | first | second)
let turnFilter = getTurnFilter();

function getTurnFilter() {
  const params = new URLSearchParams(window.location.search);
  const t = params.get("turn");
  return ["first", "second"].includes(t) ? t : "all";
}

function setTurnFilter(val) {
  if (!["all", "first", "second"].includes(val)) return;
  turnFilter = val;
  const params = new URLSearchParams(window.location.search);
  if (val === "all") {
    params.delete("turn");
  } else {
    params.set("turn", val);
  }
  const newUrl = params.toString() ? `?${params}` : window.location.pathname;
  history.replaceState(null, "", newUrl);
}

// Helper functions to resolve first-turn/second-turn values
function ftWinRate(obj) {
  if (turnFilter === "first") return obj.first_turn?.win_rate;
  if (turnFilter === "second") return obj.second_turn?.win_rate;
  return obj.win_rate;
}

function ftGames(obj) {
  if (!obj) return 0;
  if (turnFilter === "first") return obj.first_turn?.games ?? 0;
  if (turnFilter === "second") return obj.second_turn?.games ?? 0;
  return obj.games ?? 0;
}

function turnLabel() {
  if (turnFilter === "first") return " (Went First)";
  if (turnFilter === "second") return " (Went Second)";
  return "";
}

// Human label for a window_days value from a manifest ("All time" for the unbounded sentinel).
function windowLabel(days) {
  if (!days) return "";
  return days >= 9999 ? "All time" : `${days}-day window`;
}

function dataRoot(eventType, window) {
  const et = eventType || getEventType();
  const w = window || getWindow();

  // Simplified structure: data/{event_type}/{window}/
  return `data/${et}/${w}`;
}

async function fetchJSON(path, cacheBust = false) {
  // Check for nocache URL parameter to force fresh data
  const params = new URLSearchParams(window.location.search);
  const forceNoCache = params.has('nocache');

  // Use content-hash based cache busting for better invalidation
  const manifest = await loadCacheManifest();

  let url = path;
  if (forceNoCache) {
    // Force fresh fetch with timestamp
    url = `${path}?t=${Date.now()}`;
  } else if (cacheBust && manifest && Object.keys(manifest).length > 0) {
    // Extract relative path from data/ directory
    const relPath = path.startsWith('data/') ? path.slice(5) : path;
    const hash = manifest[relPath];
    if (hash) {
      url = `${path}?v=${hash}`;
    } else {
      // Fallback to date-based if file not in manifest
      url = `${path}?v=${new Date().toISOString().split('T')[0]}`;
    }
  } else if (cacheBust) {
    // Fallback to date-based if no manifest
    url = `${path}?v=${new Date().toISOString().split('T')[0]}`;
  }

  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to load ${path}: ${resp.status}`);
  return resp.json();
}

function wrClass(wr) {
  if (wr >= 55) return "wr-green";
  if (wr <= 45) return "wr-red";
  return "wr-yellow";
}

function wrBadgeClass(wr) {
  if (wr >= 55) return "badge badge-green";
  if (wr <= 45) return "badge badge-red";
  return "badge badge-yellow";
}

function trendHtml(delta) {
  if (delta === null || delta === undefined) return '<span class="trend-flat">—</span>';
  const sym = delta > 0 ? "▲" : delta < 0 ? "▼" : "—";
  const cls = delta > 0.5 ? "trend-up" : delta < -0.5 ? "trend-down" : "trend-flat";
  return `<span class="${cls}">${sym}${Math.abs(delta).toFixed(1)}%</span>`;
}

function ratingTrendHtml(delta) {
  if (delta === null || delta === undefined) return '<span class="trend-flat">—</span>';
  const sym = delta > 0 ? "▲" : delta < 0 ? "▼" : "—";
  const cls = delta > 0.5 ? "trend-up" : delta < -0.5 ? "trend-down" : "trend-flat";
  return `<span class="${cls}">${sym}${Math.abs(delta).toFixed(1)}</span>`;
}

function factionSlug(faction) {
  return faction.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

// Debounce utility for search input performance
function debounce(fn, ms) {
  let timeoutId;
  return function(...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn.apply(this, args), ms);
  };
}

// Simple sortable table. Call on a <table> element.
function makeSortable(table) {
  const headers = table.querySelectorAll("thead th");
  let sortCol = -1, sortDir = 1;

  headers.forEach((th, colIdx) => {
    th.addEventListener("click", () => {
      if (sortCol === colIdx) {
        sortDir = -sortDir;
      } else {
        sortCol = colIdx;
        sortDir = 1;
      }
      headers.forEach(h => h.classList.remove("sort-asc", "sort-desc"));
      th.classList.add(sortDir === 1 ? "sort-asc" : "sort-desc");

      const tbody = table.querySelector("tbody");
      const rows = Array.from(tbody.querySelectorAll("tr"));
      rows.sort((a, b) => {
        const av = a.cells[colIdx]?.dataset.sort ?? a.cells[colIdx]?.textContent ?? "";
        const bv = b.cells[colIdx]?.dataset.sort ?? b.cells[colIdx]?.textContent ?? "";
        const an = parseFloat(av), bn = parseFloat(bv);
        if (!isNaN(an) && !isNaN(bn)) return (an - bn) * sortDir;
        return av.localeCompare(bv) * sortDir;
      });
      rows.forEach(r => tbody.appendChild(r));
    });
  });
}

// Plotly WR colour matching Python _wr_colour
function plotlyWrColor(wr) {
  if (wr >= 60) return "#4caf50";
  if (wr >= 55) return "#8bc34a";
  if (wr >= 50) return "#ffb300";
  if (wr >= 45) return "#ff7043";
  return "#e53935";
}

// Mobile-aware Plotly config
function plotlyConfig(overrides = {}) {
  const isMobile = window.innerWidth <= 600;
  return Object.assign({
    responsive: true,
    displayModeBar: isMobile ? false : true,
    displaylogo: false,
    scrollZoom: isMobile ? false : (overrides.scrollZoom ?? false),
    staticPlot: false,
    modeBarButtonsToRemove: ['select2d', 'lasso2d'],
    modeBarButtonsToAdd: [],
  }, overrides);
}

// Default Plotly layout matching site dark theme
function darkLayout(overrides = {}) {
  const isMobile = window.innerWidth <= 600;
  const base = {
    paper_bgcolor: "#16213e",
    plot_bgcolor:  "#16213e",
    font:  { color: "#eaeaea", size: isMobile ? 10 : 11 },
    margin: { t: 30, r: 20, b: 40, l: isMobile ? 120 : 160 },
    xaxis: { gridcolor: "#2a2a4a", zerolinecolor: "#2a2a4a" },
    yaxis: { gridcolor: "#2a2a4a" },
    showlegend: false,
  };
  if (isMobile) base.dragmode = false;
  return Object.assign(base, overrides);
}

// Render site footer into element with id="site-footer"
function renderFooter(manifest) {
  const el = document.getElementById("site-footer");
  if (!el) return;
  const builtAt = manifest?.built_at ? new Date(manifest.built_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
  const window = windowLabel(manifest?.window_days);
  const asOf = manifest?.as_of ? `as of ${manifest.as_of}` : "";
  el.innerHTML = `
    <div class="footer-inner">
      <span>Data: BCP &amp; New Recruit · ${window}${asOf ? " · " + asOf : ""}${builtAt ? " · built " + builtAt : ""}</span>
      <span class="footer-links">
        <a href="legend.html">About &amp; Metrics</a>
        <a href="${manifest?.cards_url || 'https://r0ot2u.github.io/FactionCards/cards.html'}" target="_blank" rel="noopener">PNG Cards ↗</a>
      </span>
    </div>`;
}

// Force-hide modebar on mobile via direct DOM manipulation (backup for CSS)
function hideModebarOnMobile() {
  if (window.innerWidth <= 600) {
    document.querySelectorAll('.modebar').forEach(el => {
      el.style.display = 'none';
      el.style.visibility = 'hidden';
    });
  }
}

// Watch for dynamically added modebars and hide them on mobile
if (typeof window !== 'undefined' && typeof MutationObserver !== 'undefined') {
  const observer = new MutationObserver((mutations) => {
    if (window.innerWidth <= 600) {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.classList && node.classList.contains('modebar')) {
            node.style.display = 'none';
            node.style.visibility = 'hidden';
          }
          // Check children too
          if (node.querySelectorAll) {
            node.querySelectorAll('.modebar').forEach(el => {
              el.style.display = 'none';
              el.style.visibility = 'hidden';
            });
          }
        });
      });
    }
  });

  window.addEventListener('load', () => {
    hideModebarOnMobile();
    observer.observe(document.body, { childList: true, subtree: true });
  });

  window.addEventListener('resize', debounce(hideModebarOnMobile, 250));
}
