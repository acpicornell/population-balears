#!/usr/bin/env python3
"""Download the raw IBESTAT census tables (JSON-stat) into data/raw/.

IBESTAT publishes its historical-census tables through the JAXI portal at
`intranet.caib.es/ibestat-jaxi/` (reachable publicly despite the hostname).
Each table has a `px` id and is downloaded via:

    tabla.do?typeDownload=6&lang=ca&px=<PX>      # 6 = JSON-stat 2.0

The download only works once a *session cookie* exists, so we first GET the
table view (`tabla.do?px=<PX>`) to obtain the cookie, then reuse it for the
download. (A direct download with no cookie returns HTTP 500.)

Licence: IBESTAT open public-sector statistical data — attribute IBESTAT.
The raw dumps are reproducible from here, so they are git-ignored; the repo
ships only the derived `web/site_data/poblacio.json` (see build_web_data.py).
"""
from __future__ import annotations

import http.cookiejar
import pathlib
import urllib.request

BASE = "https://intranet.caib.es/ibestat-jaxi"
RAW = pathlib.Path(__file__).resolve().parent.parent / "data" / "raw"

# Tables to pull. Keyed by the local filename we save them under.
# 362e6618… = "Població de dret i de fet per illa i municipi. Censos de 1857 a 2011".
TABLES = {
    "poblacio_1857_2011.jsonstat.json": "362e6618-6d5f-490a-b6d0-6d40aba64f5d",
}

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) corpusbalear/poblacio fetch"


def _opener() -> urllib.request.OpenerDirector:
    jar = http.cookiejar.CookieJar()
    op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    op.addheaders = [("User-Agent", UA)]
    return op


def fetch(px: str) -> bytes:
    op = _opener()
    # 1) prime the session cookie by opening the table view
    op.open(f"{BASE}/tabla.do?px={px}&lang=ca", timeout=60).read()
    # 2) download the JSON-stat with the cookie in hand
    with op.open(f"{BASE}/tabla.do?typeDownload=6&lang=ca&px={px}", timeout=90) as r:
        return r.read()


def main() -> None:
    RAW.mkdir(parents=True, exist_ok=True)
    for name, px in TABLES.items():
        data = fetch(px)
        out = RAW / name
        out.write_bytes(data)
        print(f"  ✓ {name}  ({len(data):,} bytes)  px={px}")


if __name__ == "__main__":
    main()
