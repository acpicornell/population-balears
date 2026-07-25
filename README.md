# Població · Balears

[![Deploy](https://github.com/acpicornell/population-balears/actions/workflows/deploy.yml/badge.svg)](https://github.com/acpicornell/population-balears/actions/workflows/deploy.yml)

**The evolution of the population of the Balearic Islands, municipality by
municipality, across the official censuses from 1857 to 2011.** Static site on a
Cloudflare Worker, built from the open [IBESTAT](https://ibestat.es) census
tabulation. Sister project of the Corpus Balear family (`aranda`, `madoz`,
`llinatges`, `meta`…): same pattern — data pipeline → JSON → vanilla static web.

**Status: v1 (backbone).** The modern series 1857–2011 (17 censuses) is complete
and live. The 18th-century censuses (Aranda 1768, Floridablanca 1787, Godoy 1797)
are planned as a later extension of the same diachronic axis.

## Source

A single IBESTAT table — *"Població de dret i de fet per illa i municipi. Censos
de 1857 a 2011"* — downloaded as JSON-stat and reshaped **without altering any
value**. It is open public-sector data, reusable with attribution to IBESTAT.
Full provenance, the download recipe and every methodological caveat are in
[`docs/SOURCES.md`](docs/SOURCES.md).

Coverage: **67 municipalities** (Mallorca 53, Menorca 8, Eivissa i Formentera 6),
the 3 island totals and the Balears total, each with its *població de dret* and
*població de fet* series across the 17 censuses. Integrity is cross-checked: the
municipalities sum to the island/Balears totals wherever municipal data exists.

## Pipeline (built)

```
src/fetch_ibestat.py    ▶ data/raw/poblacio_1857_2011.jsonstat.json   (JAXI download, session cookie)
src/build_web_data.py   ▶ web/site_data/poblacio.json                 (flatten cube, "." -> null, verify sums)
```

No build step for the web: `web/index.html` + `web/app.js` + `web/style.css`.
Run the pipeline with the standard library only (`python3 src/fetch_ibestat.py &&
python3 src/build_web_data.py`); see `requirements.txt` for optional extras.

## Web

Tabs: **Inici** (what the site shows, *de dret* vs *de fet*, the source),
**Evolució** (an interactive line chart — the islands, the Balears total, or any
municipality; toggle *de dret*/*de fet*), **Municipis** (a sortable table:
population at any census, historical peak, growth), **Font** (method &
attribution). The chart is inline SVG — no external libraries — under a strict
CSP (`web/_headers`).

Local preview: `python3 web/dev_server.py` → <http://localhost:8175/>.
Deploy: pushed to `main` → GitHub Actions → Cloudflare Worker `poblacio-balears`
→ `poblacio.corpusbalear.org`.

## License

Code: AGPL-3.0-or-later. Data: IBESTAT open statistical data (attribution
required).
