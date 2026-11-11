"use strict";

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

let DATA = null;
let GEO = null;
let YEARS = [];
const byCode = new Map();
const areaKm2 = new Map();

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
  const [pj, gj] = await Promise.all([
    fetch("site_data/poblacio.json").then((r) => r.json()),
    fetch("site_data/municipis.geojson").then((r) => r.json()),
  ]);
  DATA = pj; GEO = gj;
  YEARS = DATA.meta.years;
  DATA.territories.forEach((t) => byCode.set(t.code, t));
  GEO.features.forEach((f) => areaKm2.set(f.properties.ID, f.properties.AREA_HA / 100));

  wireTabs();
  renderInici();
  buildMapa();
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

// ---------- MAPA (animated choropleth) ----------
let mapPaths = [];        // [{code, name, d}]
let mapDomain = null;     // {lo, hi} log-domain for the active metric
let mapTimer = null;
// The no-data fill follows the theme (style.css, --map-nodata).
const MAP_NODATA = "var(--map-nodata)";

// municipal value for a given metric at a given year (null if missing)
function metricValue(code, year, metric) {
  const t = byCode.get(code);
  if (!t) return null;
  if (metric === "densitat") {
    const v = t.dret[year], a = areaKm2.get(code);
    return v == null || !a ? null : v / a;
  }
  return t[metric][year];   // "dret" | "fet"
}
function metricAllYears(metric) {
  return metric === "densitat" ? YEARS : (metric === "fet" ? YEARS.filter((y) => y <= 1991) : YEARS);
}
function computeDomain(metric) {
  let lo = Infinity, hi = -Infinity;
  DATA.territories.filter((t) => t.level === "municipi").forEach((t) => {
    metricAllYears(metric).forEach((y) => {
      const v = metricValue(t.code, y, metric);
      if (v != null && v > 0) { if (v < lo) lo = v; if (v > hi) hi = v; }
    });
  });
  return { lo: Math.log(lo), hi: Math.log(hi) };
}
function tealRamp(t) {
  t = Math.max(0, Math.min(1, t));
  const stops = [[236, 240, 233], [151, 199, 193], [47, 111, 106], [20, 66, 61]];
  const seg = t * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(seg)), f = seg - i;
  const c = stops[i].map((a, j) => Math.round(a + (stops[i + 1][j] - a) * f));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
function colorFor(v) {
  if (v == null || v <= 0) return MAP_NODATA;
  return tealRamp((Math.log(v) - mapDomain.lo) / (mapDomain.hi - mapDomain.lo));
}

function buildMapa() {
  // equirectangular projection with cos(lat) aspect correction
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  const eachPt = (cb) => GEO.features.forEach((f) => {
    const g = f.geometry, polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
    polys.forEach((poly) => poly.forEach((ring) => ring.forEach(cb)));
  });
  eachPt(([lon, lat]) => { if (lon < minx) minx = lon; if (lon > maxx) maxx = lon; if (lat < miny) miny = lat; if (lat > maxy) maxy = lat; });
  const k = Math.cos((miny + maxy) / 2 * Math.PI / 180), W = 1000, PAD = 8;
  const sx = (W - 2 * PAD) / ((maxx - minx) * k);
  const H = Math.round((maxy - miny) * sx) + 2 * PAD;
  const proj = ([lon, lat]) => [(PAD + (lon - minx) * k * sx).toFixed(1), (PAD + (maxy - lat) * sx).toFixed(1)];
  const geomPath = (g) => {
    const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
    return polys.map((poly) => poly.map((ring) => "M" + ring.map((p) => proj(p).join(",")).join("L") + "Z").join("")).join("");
  };
  mapPaths = GEO.features.map((f) => ({ code: f.properties.ID, name: f.properties.NOM, d: geomPath(f.geometry) }));

  $("#map-svg").innerHTML =
    `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Mapa de població per municipi">` +
    mapPaths.map((m) => `<path class="muni" data-code="${m.code}" d="${m.d}"><title></title></path>`).join("") +
    `</svg>`;

  // year slider over the 17 censuses
  const sl = $("#map-year");
  sl.min = 0; sl.max = YEARS.length - 1; sl.step = 1; sl.value = YEARS.length - 1;
  sl.addEventListener("input", () => { stopPlay(); renderMapa(); });
  $("#map-metric").addEventListener("change", renderMapa);
  $("#map-play").addEventListener("click", togglePlay);
  $$("#map-svg .muni").forEach((p) => p.addEventListener("click", () => {
    $("#ev-scope").value = "municipi"; $("#ev-muni-wrap").hidden = false;
    $("#ev-muni").value = p.dataset.code; renderEvolucio(); showTab("evolucio");
  }));
  renderMapa();
}

function currentMapYear() { return YEARS[parseInt($("#map-year").value, 10)]; }

function renderMapa() {
  const metric = $("#map-metric").value;
  const year = currentMapYear();
  mapDomain = computeDomain(metric);
  const unit = metric === "densitat" ? " hab/km²" : "";
  $$("#map-svg .muni").forEach((p) => {
    const v = metricValue(p.dataset.code, year, metric);
    // A style, not the fill attribute: the no-data colour is a CSS variable,
    // which a presentation attribute cannot resolve.
    p.style.fill = colorFor(v);
    const terr = byCode.get(p.dataset.code);
    const name = terr?.name || p.dataset.code;
    const shown = v == null ? "sense dada"
      : metric === "densitat" ? fmt(Math.round(v)) + unit : fmt(v);
    const rec = terr?.reconstructed?.includes(String(year)) ? " (reconstruït)" : "";
    p.querySelector("title").textContent = `${name} · ${year}: ${shown}${rec}`;
  });
  $("#map-year-label").textContent = DATA.meta.year_labels[year] || year;
  const mLabel = metric === "dret" ? "població de dret" : metric === "fet" ? "població de fet" : "densitat (hab/km²)";
  $("#map-note").textContent =
    `${mLabel[0].toUpperCase() + mLabel.slice(1)} per municipi, cens de ${year}. ` +
    `Escala de color logarítmica i fixa (comparable entre anys). Els municipis en gris no tenen dada aquell cens ` +
    `—sovint perquè encara no existien com a municipi independent (segregacions posteriors).` +
    (metric === "fet" && year > 1991 ? " La població de fet no es publica després de 1991." : "");
  // legend gradient endpoints
  $("#map-legend-lo").textContent = fmt(Math.round(Math.exp(mapDomain.lo))) + unit;
  $("#map-legend-hi").textContent = fmt(Math.round(Math.exp(mapDomain.hi))) + unit;
}

function togglePlay() { mapTimer ? stopPlay() : startPlay(); }
function startPlay() {
  const sl = $("#map-year");
  if (+sl.value >= YEARS.length - 1) sl.value = 0;
  $("#map-play").textContent = "⏸ Atura";
  mapTimer = setInterval(() => {
    if (+sl.value >= YEARS.length - 1) { stopPlay(); return; }
    sl.value = +sl.value + 1; renderMapa();
  }, 900);
  renderMapa();
}
function stopPlay() {
  if (mapTimer) { clearInterval(mapTimer); mapTimer = null; }
  $("#map-play").textContent = "▶ Anima";
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
