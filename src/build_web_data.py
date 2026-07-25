#!/usr/bin/env python3
"""Transform the raw IBESTAT JSON-stat into web/site_data/poblacio.json.

Input : data/raw/poblacio_1857_2011.jsonstat.json   (JSON-stat 2.0 cube:
        85 territories × {dret, fet} × 17 censuses = 2 890 values)
Output: web/site_data/poblacio.json  (committed; the site reads only this)

The cube is flattened into one record per territory, each carrying its
`dret`/`fet` series keyed by census year. Island membership is inferred from
the reading order (an ALL-CAPS island header precedes its municipalities).
Missing cells (JSON-stat status ".") become null.
"""
from __future__ import annotations

import datetime as _dt
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "poblacio_1857_2011.jsonstat.json"
OUT = ROOT / "web" / "site_data" / "poblacio.json"

CONCEPTS = {"POBLACIÓ DE DRET": "dret", "POBLACIÓ DE FET": "fet"}
# Island-level totals carry the short codes 1/2/3; TT is the grand total.
ISLAND_NAMES = {"1": "Mallorca", "2": "Menorca", "3": "Eivissa i Formentera"}


def _ordered(cat: dict) -> list[tuple[str, str]]:
    """Return [(code, label)] in cube order for a JSON-stat category."""
    index, label = cat.get("index", {}), cat.get("label", {})
    if isinstance(index, dict):
        keys = sorted(index, key=lambda k: index[k])
    else:  # list form
        keys = list(index)
    return [(k, label.get(k, k)) for k in keys]


def _year(label: str) -> tuple[str, str]:
    """('1897-prov') -> (canonical '1897', display label)."""
    m = re.match(r"(\d{4})", label)
    return (m.group(1) if m else label), label


def main() -> None:
    js = json.loads(RAW.read_text(encoding="utf-8"))
    ds = js.get("dataset", js)
    dims = ds["id"]                      # e.g. ['Illa i municipi','Dades','Censos']
    sizes = ds["size"]
    cats = {d: _ordered(ds["dimension"][d]["category"]) for d in dims}
    values = ds["value"]

    terr_dim, data_dim, year_dim = dims          # positional, per this table
    terrs, datas, years = cats[terr_dim], cats[data_dim], cats[year_dim]
    strides = []                                 # row-major strides
    acc = 1
    for s in reversed(sizes):
        strides.insert(0, acc)
        acc *= s

    def val(i_t: int, i_d: int, i_y: int):
        # Missing cells arrive as the string "." directly in the value array.
        v = values[i_t * strides[0] + i_d * strides[1] + i_y * strides[2]]
        return v if isinstance(v, (int, float)) else None

    year_keys = [_year(lbl)[0] for _, lbl in years]
    year_labels = {_year(lbl)[0]: lbl for _, lbl in years if _year(lbl)[0] != lbl}
    concept_order = [CONCEPTS.get(lbl.strip().upper(), lbl) for _, lbl in datas]

    territories = []
    current_illa = None
    for i_t, (code, label) in enumerate(terrs):
        label = label.strip()
        muni = re.match(r"(\d{5})\s+(.*)", label)
        if code == "TT":                          # grand total
            level, name, illa, tcode = "conjunt", "Illes Balears", None, "BALEARS"
        elif code in ISLAND_NAMES:                # island total (codes 1/2/3)
            name = ISLAND_NAMES[code]
            level, illa, tcode = "illa", None, code
            current_illa = name
        elif label.startswith(("(Agregat)", "(Desagregat)")):
            # comparability rows that bridge municipal boundary changes; kept but
            # flagged so they are not mistaken for real, present-day municipalities
            level, name, illa, tcode = "agregat", label, current_illa, code
        elif muni:                                # a real municipality
            level, name = "municipi", muni.group(2).strip()
            illa, tcode = current_illa, muni.group(1)
        else:
            level, name, illa, tcode = "altre", label, current_illa, code

        rec = {"code": tcode, "name": name, "level": level}
        if illa:
            rec["illa"] = illa
        for i_d, concept in enumerate(concept_order):
            rec[concept] = {
                yk: val(i_t, i_d, i_y)
                for i_y, yk in enumerate(year_keys)
            }
        territories.append(rec)

    # --- territorial harmonization (merges only) ---
    # A few modern municipalities have no own-code figures in the early censuses
    # because of a past boundary change. Where the change is a *merge* — the
    # constituent comparability rows sum exactly to the modern territory — we
    # reconstruct the early series from that sum (marking the years). *Splits*
    # are left as gaps: the combined figure cannot be divided into the modern
    # units, so colouring them would invent numbers.
    MERGES = {
        # modern code : comparability rows whose sum is the modern territory
        "07040": ["(Desagregat) Palma sense Establiments",   # Establiments was
                  "(Desagregat) Establiments"],              # annexed to Palma, 1919
    }
    by_name = {t["name"]: t for t in territories}
    recon_note = {}
    for code, parts in MERGES.items():
        muni = next((t for t in territories if t["code"] == code and t["level"] == "municipi"), None)
        srcs = [by_name[p] for p in parts if p in by_name]
        if not muni or len(srcs) != len(parts):
            continue
        filled = []
        for concept in ("dret", "fet"):
            for yk in year_keys:
                if muni[concept][yk] is None:
                    vals = [s[concept][yk] for s in srcs]
                    if any(v is not None for v in vals):
                        muni[concept][yk] = sum(v or 0 for v in vals)
                        filled.append(yk)
        if filled:
            muni["reconstructed"] = sorted(set(filled), key=int)
            recon_note[muni["name"]] = {"from": parts, "years": muni["reconstructed"]}

    out = {
        "meta": {
            "title": "Població de les Illes Balears · censos de 1857 a 2011",
            "source": "IBESTAT (Institut d'Estadística de les Illes Balears)",
            "source_table": ds.get("label", ""),
            "source_px": "362e6618-6d5f-490a-b6d0-6d40aba64f5d",
            "source_url": (
                "https://intranet.caib.es/ibestat-jaxi/tabla.do?"
                "px=362e6618-6d5f-490a-b6d0-6d40aba64f5d&lang=ca"
            ),
            "license": "IBESTAT open public-sector statistical data (attribute IBESTAT)",
            "ibestat_updated": ds.get("updated"),
            "generated": _dt.date.today().isoformat(),
            "years": [int(y) for y in year_keys],
            "year_labels": year_labels,
            "concepts": {"dret": "Població de dret", "fet": "Població de fet"},
            "counts": {
                "municipis": sum(t["level"] == "municipi" for t in territories),
                "illes": sum(t["level"] == "illa" for t in territories),
                "agregats": sum(t["level"] == "agregat" for t in territories),
            },
            "reconstruction": recon_note,
        },
        "territories": territories,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    m = out["meta"]["counts"]
    print(f"  ✓ {OUT.relative_to(ROOT)}  —  {m['municipis']} municipis, "
          f"{m['illes']} illes, {len(out['meta']['years'])} censuses")


if __name__ == "__main__":
    main()
