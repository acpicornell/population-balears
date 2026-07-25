# CLAUDE.md — poblacio (Població · Balears)

Diachronic population of the Balearic Islands, 1857–2011, from IBESTAT. Part of
the Corpus Balear family; same conventions as the sibling projects.

## Golden rules

- **Repo content in English** (code, comments, docs, commits). UI copy is Catalan.
- **Never invent a figure.** Every number comes from the IBESTAT table; missing
  cells stay `null`, never 0. `src/build_web_data.py` verifies the municipal sums
  equal the island/Balears totals.
- Data provenance & caveats live in `docs/SOURCES.md` — keep them in sync.

## Layout

```
src/fetch_ibestat.py     download the raw JSON-stat (JAXI, needs a session cookie)
src/build_web_data.py    raw cube -> web/site_data/poblacio.json
data/raw/                git-ignored raw dumps (reproducible)
web/                     static SPA: index.html + app.js + style.css + _headers
web/site_data/poblacio.json   the only artifact the site reads (committed)
wrangler.jsonc           Worker "poblacio-balears", workers_dev:false, assets: web
.github/workflows/deploy.yml   guarded deploy (needs CLOUDFLARE_API_TOKEN secret)
```

## Rebuild the data

```
python3 src/fetch_ibestat.py     # -> data/raw/*.jsonstat.json
python3 src/build_web_data.py    # -> web/site_data/poblacio.json
```

Stdlib only. The IBESTAT download needs the session-cookie two-step (open
`tabla.do?px=` then download `typeDownload=6`) — already handled in the fetcher.

## Data model (`web/site_data/poblacio.json`)

- `meta`: title, source, `source_px`/`source_url`, `license`, `years` (17),
  `year_labels` (e.g. 1897 -> "1897-prov"), `concepts`, `counts`.
- `territories[]`: `{ code, name, level, illa?, dret:{year:val|null}, fet:{…} }`.
  `level` ∈ {conjunt (Balears), illa (Mallorca/Menorca/Eivissa i Formentera),
  municipi (67), agregat (14 comparability rows — kept, not mixed in)}.

## Deploy

Push to `main` → Action deploys to Cloudflare (`poblacio-balears`) →
`poblacio.corpusbalear.org`. Deployed via GitHub Actions only (no Cloudflare
Workers-Builds Git connection — keep it that way, like the rest of the fleet).

## Backlog

- Extend back to Segle XVIII (Aranda 1768, Floridablanca 1787, Godoy 1797) as
  separate JAXI tables → one diachronic axis of ~250 years.
- Optional: municipal coordinates (NGIB, from `meta`) for a map view; growth
  small-multiples; per-decade change.
