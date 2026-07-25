# Sources & provenance

## The data

**IBESTAT — "Població de dret i de fet per illa i municipi. Censos de 1857 a
2011"** (Institut d'Estadística de les Illes Balears).

- Portal: IBESTAT JAXI, *Demografia → Població → Censos de població → Censos
  històrics* (reachable at `intranet.caib.es/ibestat-jaxi/`, publicly accessible
  despite the hostname).
- Table `px` id: `362e6618-6d5f-490a-b6d0-6d40aba64f5d`.
- Download (JSON-stat 2.0):
  `https://intranet.caib.es/ibestat-jaxi/tabla.do?typeDownload=6&lang=ca&px=362e6618-6d5f-490a-b6d0-6d40aba64f5d`
  — needs a session cookie first (open `tabla.do?px=<id>` once, reuse the
  cookie), handled by `src/fetch_ibestat.py`. Formats: `typeDownload` 0 = PC-Axis,
  3 = CSV/Excel, 6 = JSON-stat.

The cube is 85 territories × {població de dret, població de fet} × 17 censuses
(1857, 1860, 1877, 1887, 1897, 1900, 1910, 1920, 1930, 1940, 1950, 1960, 1970,
1981, 1991, 2001, 2011) = 2 890 values.

## What we ship

Only the derived `web/site_data/poblacio.json`, produced by
`src/build_web_data.py` **without altering any value**. The raw JSON-stat dump is
git-ignored (reproducible from `src/fetch_ibestat.py`).

Integrity check: the sum of the 67 municipalities equals the Illes Balears total
for every census where municipal data exists (e.g. 2011 de dret: 1 100 503).

## Caveats (baked into the data, documented for reuse)

- **De dret vs de fet:** residents of record vs. those physically present on
  census night. From 2001 only *de dret* is published (the *de fet* 2011 cell is
  empty).
- **Missing municipal cells** for older censuses (especially *de dret* before
  1930) are kept as `null`, never as 0.
- **1897** is provisional in the source (`1897-prov`).
- **"(Agregat)" / "(Desagregat)" rows** are IBESTAT comparability series that
  bridge municipal boundary changes (e.g. Consell segregated from Alaró, es
  Migjorn Gran from es Mercadal, Establiments within Palma). Kept in the data with
  `level: "agregat"` and never mixed with the 67 present-day municipalities.
  - **Merge reconstruction:** where a modern municipality has no own figure in the
    early censuses but the comparability rows *sum* to its territory, the early
    series is reconstructed from that sum and the years are flagged
    (`reconstructed`, and `meta.reconstruction`). The only case is **Palma**
    before 1920 = *Palma sense Establiments + Establiments* (annexed 1919); the
    pieces run 1857–1910 and Palma's own code starts 1920, so there is no overlap.
  - **Splits are left as gaps:** a combined figure cannot be divided into the
    modern units, so segregated municipalities stay empty (grey on the map) until
    they exist separately. Not a data error — the boundary did not yet exist.
- **Eivissa and Formentera** appear grouped as a single island in this table.

## Municipal boundaries (for the map)

**IDEIB — `GOIB_UnitAdm_IB` MapServer, layer 1 "Municipis"** (Infraestructura de
Dades Espacials de les Illes Balears): official IGN "Registro Central de
Cartografía" municipal limits with the MTIB 1:5000 coastline.

- `https://ideib.caib.es/geoserveis/rest/services/public/GOIB_UnitAdm_IB/MapServer/1`
- Fetched by `src/fetch_boundaries.py`: native SR is ETRS89/UTM31N (EPSG:25831);
  server-side reprojection to 4326 returns HTTP 500, and requesting all features
  at once also 500s, so we page in chunks and request **server-side
  generalization** (`maxAllowableOffset=100` m) — this turns a ~500k-vertex
  coastline into ~3k vertices/20 munis and is topology-consistent (shared borders
  generalize identically, no gaps).
- Reprojected to WGS84 and written to `web/site_data/municipis.geojson` with GDAL
  (`ogr2ogr -t_srs EPSG:4326 -where "ID IS NOT NULL"`; the layer carries one
  attribute-less stray polygon, dropped here). 67 municipalities, keyed by the
  INE code in `ID`, joining 1:1 to the population data. `AREA_HA` gives density.

Attribution: IDEIB / Institut Geogràfic Nacional (IGN), open data.

## Licence

Underlying data: IBESTAT open public-sector statistical data — **reusable with
attribution to IBESTAT**; boundaries © IDEIB/IGN (open, attribution). This
repository's code: AGPL-3.0-or-later.

## Extending back to the 18th century (planned)

The same JAXI portal holds the 18th-century censuses as separate tables under
*Censos històrics → Segle XVIII*: **Aranda (1768)**, **Floridablanca (1787)**,
**Godoy (1797)**. Pulling them the same way would extend the diachronic axis to
~250 years. (Aranda 1768 is already edited in the sibling `aranda` project.)
