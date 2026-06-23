/* Shared helpers for Informed Crusader interactive site */

const DEFAULT_EVENT_TYPE = "all";
const DEFAULT_WINDOW = "7d";
const SUPPORTED_WINDOWS = ["7d", "14d", "30d", "60d"];

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

function dataRoot(eventType, window) {
  const et = eventType || getEventType();
  const w = window || getWindow();

  // Simplified structure: data/{event_type}/{window}/
  return `data/${et}/${w}`;
}

async function fetchJSON(path, cacheBust = false) {
  // Use content-hash based cache busting for better invalidation
  const manifest = await loadCacheManifest();

  let url = path;
  if (cacheBust && manifest && Object.keys(manifest).length > 0) {
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

// Default Plotly layout matching site dark theme
function darkLayout(overrides = {}) {
  return Object.assign({
    paper_bgcolor: "#16213e",
    plot_bgcolor:  "#16213e",
    font:  { color: "#eaeaea", size: 11 },
    margin: { t: 30, r: 20, b: 40, l: 160 },
    xaxis: { gridcolor: "#2a2a4a", zerolinecolor: "#2a2a4a" },
    yaxis: { gridcolor: "#2a2a4a" },
    showlegend: false,
  }, overrides);
}

// Render site footer into element with id="site-footer"
function renderFooter(manifest) {
  const el = document.getElementById("site-footer");
  if (!el) return;
  const builtAt = manifest?.built_at ? new Date(manifest.built_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
  const window = manifest?.window_days ? `${manifest.window_days}-day window` : "";
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
