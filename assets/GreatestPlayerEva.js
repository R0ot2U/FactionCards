/* GreatestPlayerEva page — /GreatestPlayerEva/<s1>/<s2> */

// Edit this line to change the page's fixed text.
// {{s1}} and {{s2}} are replaced with the two values from the URL
// (/GreatestPlayerEva/<s1>/<s2>), HTML-escaped.
const GPE_TEMPLATE = "<p>Fuck off {{s1}},</p><p> </p>signed<p>  {{s2}}</p>";

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, c => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

function render() {
  const params = new URLSearchParams(location.search);
  const s1 = params.get("s1");
  const s2 = params.get("s2");
  const el = document.getElementById("gpe-content");

  if (s1 == null || s2 == null) {
    el.textContent = "Missing values — expected a URL like /GreatestPlayerEva/<string1>/<string2>.";
    return;
  }

  el.innerHTML = GPE_TEMPLATE
    .replace(/\{\{s1\}\}/g, escapeHtml(s1))
    .replace(/\{\{s2\}\}/g, escapeHtml(s2));

  // Restore the clean path in the address bar now that the content is rendered.
  const base = location.pathname.replace(/\/GreatestPlayerEva\.html$/, "");
  history.replaceState(null, "", `${base}/GreatestPlayerEva/${encodeURIComponent(s1)}/${encodeURIComponent(s2)}`);
}

document.addEventListener("DOMContentLoaded", render);
