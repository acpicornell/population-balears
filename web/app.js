"use strict";

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

let DATA = null;
let YEARS = [];
const byCode = new Map();

const ISLAND_COLORS = {
  "1": "var(--c-mallorca)",
  "2": "var(--c-menorca)",
  "3": "var(--c-eivissa)",
};

function fmt(n) {
  if (n === null || n === undefined) return "—";
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---------- boot ----------
async function boot() {
  const res = await fetch("site_data/poblacio.json");
  DATA = await res.json();
  YEARS = DATA.meta.years;
  DATA.territories.forEach((t) => byCode.set(t.code, t));

  wireTabs();
  renderInici();
  buildEvolucioControls();
  renderEvolucio();
  buildMunicipisControls();
  renderMunicipis();
  renderFont();
}

function wireTabs() {
  $$(".tab").forEach((btn) =>
    btn.addEventListener("click", () => showTab(btn.dataset.tab)));
}
function showTab(name) {
  $$(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  $$(".tab-content").forEach((s) =>
    s.classList.toggle("active", s.id === "tab-" + name));
  window.scrollTo(0, 0);
}

// ---------- INICI ----------
function renderInici() {
  const bal = byCode.get("BALEARS");
  const first = bal.dret[YEARS[0]];
  const last = bal.dret[YEARS[YEARS.length - 1]];
  $("#stat-first").textContent = fmt(first);
  $("#stat-last").textContent = fmt(last);
  $("#stat-mult").textContent = "×" + (last / first).toFixed(1).replace(".", ",");
  $("#stat-muni").textContent = DATA.meta.counts.municipis;
}

// ---------- generic SVG line chart ----------
// series: [{ label, color, dashed, points:[{year, val}] }]
function lineChart(container, series, opts = {}) {
  const W = 900, H = 420, ML = 66, MR = 18, MT = 16, MB = 40;
  const iw = W - ML - MR, ih = H - MT - MB;
  const y0 = YEARS[0], y1 = YEARS[YEARS.length - 1];

  let vmax = 0;
  series.forEach((s) => s.points.forEach((p) => { if (p.val != null && p.val > vmax) vmax = p.val; }));
  if (vmax <= 0) { container.innerHTML = '<p class="chart-note">Sense dades per a aquesta selecció.</p>'; return; }
  const ymax = niceCeil(vmax);

  const xOf = (yr) => ML + ((yr - y0) / (y1 - y0)) * iw;
  const yOf = (v) => MT + ih - (v / ymax) * ih;

  const parts = [];
  // y gridlines + labels
  const ticks = 5;
  for (let i = 0; i <= ticks; i++) {
    const v = (ymax / ticks) * i, y = yOf(v);
    parts.push(`<line class="gridline" x1="${ML}" y1="${y.toFixed(1)}" x2="${W - MR}" y2="${y.toFixed(1)}"/>`);
    parts.push(`<text class="axis-label" x="${ML - 8}" y="${(y + 3).toFixed(1)}" text-anchor="end">${fmt(Math.round(v))}</text>`);
  }
  // x labels (census years, rotated for room)
  YEARS.forEach((yr) => {
    const x = xOf(yr);
    parts.push(`<text class="axis-label" transform="translate(${x.toFixed(1)},${H - MB + 14}) rotate(-45)" text-anchor="end">${DATA.meta.year_labels[yr] || yr}</text>`);
  });
  // series
  series.forEach((s) => {
    for (const seg of contiguous(s.points)) {
      if (seg.length < 1) continue;
      const d = seg.map((p, i) => `${i ? "L" : "M"}${xOf(p.year).toFixed(1)},${yOf(p.val).toFixed(1)}`).join(" ");
      parts.push(`<path class="series-line${s.dashed ? " fet" : ""}" style="stroke:${s.color}" d="${d}"/>`);
    }
    s.points.forEach((p) => {
      if (p.val == null) return;
      parts.push(`<circle class="series-pt" style="fill:${s.color}" cx="${xOf(p.year).toFixed(1)}" cy="${yOf(p.val).toFixed(1)}" r="3"><title>${esc(s.label)} · ${p.year}: ${fmt(p.val)}</title></circle>`);
    });
  });

  container.innerHTML =
    `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.aria || "gràfic")}">` +
    `<line class="axis" x1="${ML}" y1="${MT}" x2="${ML}" y2="${MT + ih}"/>` +
    `<line class="axis" x1="${ML}" y1="${MT + ih}" x2="${W - MR}" y2="${MT + ih}"/>` +
    parts.join("") + `</svg>`;
}
function contiguous(points) {
  const runs = []; let cur = [];
  points.forEach((p) => {
    if (p.val == null) { if (cur.length) { runs.push(cur); cur = []; } }
    else cur.push(p);
  });
  if (cur.length) runs.push(cur);
  return runs;
}
function niceCeil(v) {
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
    if (m * mag >= v) return m * mag;
  }
  return 10 * mag;
}
function seriesOf(t, concept, label, color, dashed) {
  return { label, color, dashed, points: YEARS.map((y) => ({ year: y, val: t[concept][y] })) };
}

// ---------- EVOLUCIÓ ----------
function buildEvolucioControls() {
  const sel = $("#ev-muni");
  DATA.territories
    .filter((t) => t.level === "municipi")
    .sort((a, b) => a.name.localeCompare(b.name, "ca"))
    .forEach((t) => {
      const o = document.createElement("option");
      o.value = t.code; o.textContent = `${t.name} (${t.illa})`;
      sel.appendChild(o);
    });
  $("#ev-scope").addEventListener("change", () => {
    $("#ev-muni-wrap").hidden = $("#ev-scope").value !== "municipi";
    renderEvolucio();
  });
  $("#ev-muni").addEventListener("change", renderEvolucio);
  $("#ev-concept").addEventListener("change", renderEvolucio);
}
function renderEvolucio() {
  const scope = $("#ev-scope").value;
  const concept = $("#ev-concept").value;
  const cLabel = concept === "dret" ? "de dret" : "de fet";
  let series = [];
  let note = `Població ${cLabel}, per cens. Els punts que falten (línia interrompuda) són cel·les buides a la font, no zeros.`;

  if (scope === "balears") {
    series = [seriesOf(byCode.get("BALEARS"), concept, "Illes Balears", "var(--c-balears)", concept === "fet")];
  } else if (scope === "municipi") {
    const t = byCode.get($("#ev-muni").value) || byCode.get("BALEARS");
    series = [seriesOf(t, concept, t.name, "var(--c-mallorca)", concept === "fet")];
    note += ` Municipi de ${t.name} (${t.illa}).`;
  } else {
    series = DATA.territories
      .filter((t) => t.level === "illa")
      .map((t) => seriesOf(t, concept, t.name, ISLAND_COLORS[t.code], concept === "fet"));
  }
  if (concept === "fet") note += " La població de fet no es publica al cens de 2011.";
  $("#ev-note").textContent = note;

  lineChart($("#ev-chart"), series, { aria: `Evolució de la població ${cLabel}` });
  $("#ev-legend").innerHTML = series.map((s) =>
    `<span class="lg"><span class="sw" style="background:${s.color}"></span>${esc(s.label)}</span>`).join("");
}

// ---------- MUNICIPIS ----------
function buildMunicipisControls() {
  const y = $("#mn-year");
  YEARS.forEach((yr) => {
    const o = document.createElement("option");
    o.value = yr; o.textContent = DATA.meta.year_labels[yr] || yr;
    if (yr === YEARS[YEARS.length - 1]) o.selected = true;
    y.appendChild(o);
  });
  DATA.territories.filter((t) => t.level === "illa").forEach((t) => {
    const o = document.createElement("option");
    o.value = t.name; o.textContent = t.name;
    $("#mn-illa").appendChild(o);
  });
  ["#mn-year", "#mn-concept", "#mn-illa"].forEach((id) =>
    $(id).addEventListener("change", renderMunicipis));
  $$("#mn-table th.sortable").forEach((th) => th.addEventListener("click", () => {
    const k = th.dataset.k;
    mnSort = { k, desc: mnSort.k === k ? !mnSort.desc : (k !== "name" && k !== "illa") };
    renderMunicipis();
  }));
}
let mnSort = { k: "pop", desc: true };

function firstLast(t, concept) {
  const vals = YEARS.map((y) => ({ y, v: t[concept][y] })).filter((o) => o.v != null);
  if (vals.length < 2) return null;
  const f = vals[0], l = vals[vals.length - 1];
  return { pct: (l.v - f.v) / f.v * 100, fromY: f.y, toY: l.y };
}
function peakOf(t, concept) {
  let best = null;
  YEARS.forEach((y) => { const v = t[concept][y]; if (v != null && (!best || v > best.v)) best = { y, v }; });
  return best;
}
function renderMunicipis() {
  const year = $("#mn-year").value;
  const concept = $("#mn-concept").value;
  const illa = $("#mn-illa").value;
  let rows = DATA.territories.filter((t) => t.level === "municipi" && (!illa || t.illa === illa));

  const enrich = rows.map((t) => {
    const growth = firstLast(t, concept);
    const peak = peakOf(t, concept);
    return { t, pop: t[concept][year], peak, growth: growth ? growth.pct : null };
  });
  const dir = mnSort.desc ? -1 : 1;
  enrich.sort((a, b) => {
    let av, bv;
    switch (mnSort.k) {
      case "name": av = a.t.name; bv = b.t.name; return dir * av.localeCompare(bv, "ca");
      case "illa": av = a.t.illa; bv = b.t.illa; return dir * (av.localeCompare(bv, "ca") || a.t.name.localeCompare(b.t.name, "ca"));
      case "peak": av = a.peak ? a.peak.v : -1; bv = b.peak ? b.peak.v : -1; break;
      case "growth": av = a.growth ?? -1e9; bv = b.growth ?? -1e9; break;
      default: av = a.pop ?? -1; bv = b.pop ?? -1;
    }
    return dir * (av - bv);
  });

  $("#mn-body").innerHTML = enrich.map(({ t, pop, peak, growth }) => {
    const g = growth == null ? '<span class="muted">—</span>'
      : `<span class="${growth >= 0 ? "growth-pos" : "growth-neg"}">${growth >= 0 ? "+" : "−"}${Math.abs(growth).toFixed(0)}%</span>`;
    const pk = peak ? `${fmt(peak.v)} <span class="peak-year">(${peak.y})</span>` : "—";
    return `<tr data-code="${t.code}">` +
      `<td>${esc(t.name)}</td>` +
      `<td class="muted">${esc(t.illa || "")}</td>` +
      `<td class="num${pop == null ? " muted" : ""}">${fmt(pop)}</td>` +
      `<td class="num">${pk}</td>` +
      `<td class="num">${g}</td></tr>`;
  }).join("");

  $$("#mn-body tr").forEach((tr) => tr.addEventListener("click", () => {
    $("#ev-scope").value = "municipi";
    $("#ev-muni-wrap").hidden = false;
    $("#ev-muni").value = tr.dataset.code;
    renderEvolucio();
    showTab("evolucio");
  }));
}

// ---------- FONT ----------
function renderFont() {
  const m = DATA.meta;
  $("#src-line").innerHTML =
    `Taula <a href="${esc(m.source_url)}">«${esc(m.source_table)}»</a> — ${esc(m.source)}. ` +
    `Actualització a la font: ${esc(m.ibestat_updated || "—")}. Dades generades el ${esc(m.generated)}.`;
  $("#cite-box").innerHTML =
    `<strong>Com citar:</strong> Picornell Company, A. C. (2026). <em>Població · Balears: ` +
    `evolució de la població de les Illes Balears, censos de 1857 a 2011</em>. Corpus Balear. ` +
    `poblacio.corpusbalear.org. Dades: IBESTAT.`;
}

boot();
