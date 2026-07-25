#!/usr/bin/env python3
"""Download the Balearic municipal boundaries (IDEIB) into data/raw/.

Source: IDEIB `GOIB_UnitAdm_IB` MapServer, layer 1 "Municipis" — official IGN
municipal limits with the MTIB 1:5000 coastline. Open data, attribute IDEIB/IGN.

    https://ideib.caib.es/geoserveis/rest/services/public/GOIB_UnitAdm_IB/MapServer/1

The layer is served in ETRS89 / UTM 31N (EPSG:25831). Two quirks handled here:
  * server-side reprojection to 4326 returns HTTP 500 → we fetch native SR and
    reproject later with GDAL;
  * requesting all features at once 500s (the geometry is very dense) → we page
    in small chunks and merge into one Esri-JSON FeatureSet.

Output: data/raw/municipis_ideib.json (Esri JSON, EPSG:25831). Reproject +
simplify to web/site_data/municipis.geojson with GDAL + mapshaper (see README).
"""
from __future__ import annotations

import json
import pathlib
import urllib.parse
import urllib.request

LAYER = ("https://ideib.caib.es/geoserveis/rest/services/public/"
         "GOIB_UnitAdm_IB/MapServer/1")
FIELDS = "ID,NOM,NOM_CONSELL_ILLA,AREA_HA"
PAGE = 20            # chunks larger than this 500 on this server
MAX_OFFSET = 100     # server-side generalization, metres (EPSG:25831).
# 100 m turns the raw ~500 k-vertex coastline into ~3 k vertices per 20 munis —
# ample for an archipelago-scale choropleth, and topology-consistent (the server
# generalizes shared borders identically, so no gaps between municipalities).
RAW = pathlib.Path(__file__).resolve().parent.parent / "data" / "raw"
OUT = RAW / "municipis_ideib.json"
UA = "corpusbalear/poblacio boundaries fetch"


def _get(offset: int) -> dict:
    qs = urllib.parse.urlencode({
        "where": "1=1", "outFields": FIELDS, "returnGeometry": "true",
        "maxAllowableOffset": MAX_OFFSET,
        "resultRecordCount": PAGE, "resultOffset": offset, "f": "json",
    })
    req = urllib.request.Request(f"{LAYER}/query?{qs}", headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.load(r)


def main() -> None:
    RAW.mkdir(parents=True, exist_ok=True)
    first = _get(0)
    if "error" in first:
        raise SystemExit(f"server error: {first['error']}")
    feats = list(first["features"])
    offset = PAGE
    while True:
        page = _get(offset)
        chunk = page.get("features", [])
        if not chunk:
            break
        feats.extend(chunk)
        offset += PAGE
        if not page.get("exceededTransferLimit") and len(chunk) < PAGE:
            break
    merged = {
        "geometryType": first["geometryType"],
        "spatialReference": first["spatialReference"],
        "fields": first["fields"],
        "features": feats,
    }
    OUT.write_text(json.dumps(merged), encoding="utf-8")
    print(f"  ✓ {OUT.name}  {len(feats)} municipis  ({OUT.stat().st_size:,} bytes, EPSG:25831)")


if __name__ == "__main__":
    main()
