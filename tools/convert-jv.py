#!/usr/bin/env python3
"""Convert decoded JV-Data (.sj) into Full-JSON-style JSONables.

Reuses the JVData_Structure.h schema parser from JVD/Converter/convert_decoded_to_jsons.py.
Only the record types the apps use are converted. Values stay strings; ASCII and
full-width whitespace is trimmed on both ends.

Output: data/jv/<table>.jsonl (one JSON object per line) + <table>.meta.json.

Files are processed in embedded-creation-timestamp order, so for a given key later
(newer head_MakeDate) records come later in the .jsonl; loaders keep the record whose
revisionField (head_MakeDate) is highest, later line winning ties.
"""

import json
import sys
from pathlib import Path

CONVERTER = Path("/Users/s/Desktop/JVD/Converter")
DECODED = Path("/Users/s/Desktop/JVD/decoded")
OUT = Path(__file__).resolve().parent.parent / "data" / "jv"

sys.path.insert(0, str(CONVERTER))
import convert_decoded_to_jsons as C  # noqa: E402

# Primary-key fields per record type: the MySQL PKs jv2mysql used, minus the
# head_DataKubun/head_MakeDate revision fields (revisions collapse, last MakeDate wins).
KEY_FIELDS = {
    "RA": ["id_Year", "id_MonthDay", "id_JyoCD", "id_Kaiji", "id_Nichiji", "id_RaceNum"],
    # SE deliberately uses Bamei instead of the JRA-VAN recommended Umaban/KettoNum:
    # foreign-race rows can have KettoNum=0, and early data may not have stable Umaban.
    "SE": ["id_Year", "id_MonthDay", "id_JyoCD", "id_Kaiji", "id_Nichiji", "id_RaceNum", "Bamei"],
    "UM": ["KettoNum"],
    "KS": ["KisyuCode"],
    "CH": ["ChokyosiCode"],
    "BR": ["BreederCode"],
    "BN": ["BanusiCode"],
    "HN": ["HansyokuNum"],
    "SK": ["KettoNum"],
    "RC": ["RecInfoKubun", "id_Year", "id_MonthDay", "id_JyoCD", "id_Kaiji", "id_Nichiji", "id_RaceNum"],
    "HS": ["KettoNum", "SaleCode", "FromDate_Year", "FromDate_Month", "FromDate_Day"],
    "BT": ["HansyokuNum"],
    # CS (course) has no decoded source files and 0 rows in MySQL — not converted.
}

TRIM = " 　\t\r\n\x00"


def main() -> int:
    structs = C.HeaderParser(CONVERTER / "JVData_Structure.h").parse()
    schemas = {t: C.expand_schema(structs, C.RECORD_STRUCTS[t]) for t in KEY_FIELDS}

    for t, keys in KEY_FIELDS.items():
        names = {f.name for f in schemas[t]}
        missing = [k for k in keys if k not in names]
        if missing:
            raise SystemExit(f"{t}: key fields not in schema: {missing}")

    OUT.mkdir(parents=True, exist_ok=True)

    tables = {t: C.table_name_for(C.RECORD_STRUCTS[t]) for t in KEY_FIELDS}
    writers = {t: (OUT / f"{tables[t]}.jsonl").open("w", encoding="utf-8", newline="\n") for t in KEY_FIELDS}
    counts = dict.fromkeys(KEY_FIELDS, 0)

    # Name layout: <TYPE(2)><...><created yyyymmddhhmmss(14)>.sj — sort chronologically.
    files = sorted(DECODED.rglob("*.sj"), key=lambda p: p.name[-17:])

    for index, path in enumerate(files, start=1):
        t = path.name[:2]
        if t not in KEY_FIELDS:
            continue
        fields = schemas[t]
        expected = sum(f.width for f in fields)
        write = writers[t].write
        for raw in path.read_bytes().splitlines():
            if not raw:
                continue
            if raw[:2].decode("ascii") != t:
                raise SystemExit(f"{path}: line type {raw[:2]!r} != file type {t}")
            if len(raw) != expected:
                raise SystemExit(f"{path}: record is {len(raw)} bytes, expected {expected}")
            obj = {}
            cursor = 0
            for f in fields:
                obj[f.name] = raw[cursor : cursor + f.width].decode("cp932").strip(TRIM)
                cursor += f.width
            if not any(obj[k] for k in KEY_FIELDS[t]):
                continue  # blank key — unusable record
            write(json.dumps(obj, ensure_ascii=False, separators=(",", ":")) + "\n")
            counts[t] += 1
        if index % 200 == 0:
            print(f"[{index}/{len(files)}] {json.dumps(counts)}", flush=True)

    for t, w in writers.items():
        w.close()
        meta = {
            "style": "full",
            "keyFields": KEY_FIELDS[t],
            "revisionField": "head_MakeDate",
            "fields": [f.name for f in schemas[t]],
        }
        (OUT / f"{tables[t]}.meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent="\t"))
        print(f"{tables[t]}: {counts[t]} records")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
