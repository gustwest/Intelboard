"""Engångskonvertering: SCB:s namnstatistik (xlsx) → data/scb_fornamn_2022.csv.gz.

Källa (nedladdad 2026-06-10, serien "uppdateras ej" — frusen vid 2022-12-31):
https://www.scb.se/hitta-statistik/statistik-efter-amne/befolkning-och-levnadsforhallanden/
ovrigt/namnstatistik/ → "Samtliga folkbokförda – förnamn ... med minst två bärare"
(namn-med-minst-tva-barare-31-december-2022.xlsx)

Flikarna "Förnamn kvinnor" och "Förnamn män" slås ihop till rader
`namn,kvinnor,män` (casefoldat namn, antal bärare per kön). Förnamn (inte
tilltalsnamn) väljs för bredast täckning — NER-extraherade namn kan vara vilket
som helst av en persons förnamn.

Körs manuellt vid behov: python scripts/build_scb_name_data.py <xlsx> <ut.csv.gz>
Kräver openpyxl (finns ej i requirements.txt — datafilen är checkad in, skriptet
är proveniens/reproducerbarhet, inte runtime).
"""
from __future__ import annotations

import csv
import gzip
import io
import sys
import unicodedata


def _read_sheet(wb, sheet_name: str) -> dict[str, int]:
    ws = wb[sheet_name]
    out: dict[str, int] = {}
    header_seen = False
    for row in ws.iter_rows(values_only=True):
        name, count = (row[0], row[1]) if len(row) >= 2 else (None, None)
        if not header_seen:
            if name == "Förnamn":  # kolumnrubrik — datan börjar efter denna
                header_seen = True
            continue
        if not name or count is None:
            continue
        key = unicodedata.normalize("NFC", str(name).strip()).casefold()
        if key:
            out[key] = out.get(key, 0) + int(count)
    return out


def main(xlsx_path: str, out_path: str) -> None:
    import openpyxl

    wb = openpyxl.load_workbook(xlsx_path, read_only=True)
    women = _read_sheet(wb, "Förnamn kvinnor")
    men = _read_sheet(wb, "Förnamn män")

    buf = io.StringIO()
    writer = csv.writer(buf)
    for name in sorted(set(women) | set(men)):
        writer.writerow([name, women.get(name, 0), men.get(name, 0)])

    with gzip.open(out_path, "wt", encoding="utf-8", newline="") as f:
        f.write(buf.getvalue())
    print(f"{len(set(women) | set(men))} namn → {out_path}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
