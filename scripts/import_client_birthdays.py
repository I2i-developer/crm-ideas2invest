import datetime
import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

DEFAULT_WORKBOOK_CANDIDATES = [
    Path("Updated DOB.xlsx"),
    Path("Clients Birthdays.xlsx"),
]
OUTPUT_PATH = Path("src/data/clientBirthdays.json")

MANUAL_BIRTHDAYS = [
    ("Poonam Singh Parihar", "01-14-1980"),
    ("Kshetrimayum Indira Devi", "01-07-1976"),
    ("Kartikaya Chadha", "02-05-1998"),
    ("Neera Arora", "08-19-1961"),
    ("Shruti Suresh", "11-11-1998"),
    ("Rahul Balakrishan", "12-31-1985"),
]

NS = {
    "a": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}

MONTH_ALIASES = {
    "jan": (1, "January"),
    "january": (1, "January"),
    "feb": (2, "February"),
    "february": (2, "February"),
    "mar": (3, "March"),
    "march": (3, "March"),
    "apr": (4, "April"),
    "april": (4, "April"),
    "may": (5, "May"),
    "jun": (6, "June"),
    "june": (6, "June"),
    "jul": (7, "July"),
    "july": (7, "July"),
    "aug": (8, "August"),
    "august": (8, "August"),
    "sep": (9, "September"),
    "sept": (9, "September"),
    "september": (9, "September"),
    "oct": (10, "October"),
    "october": (10, "October"),
    "nov": (11, "November"),
    "november": (11, "November"),
    "dec": (12, "December"),
    "december": (12, "December"),
}


def cell_position(ref):
    match = re.match(r"([A-Z]+)(\d+)", ref)
    col = 0
    for char in match.group(1):
        col = col * 26 + ord(char) - 64
    return int(match.group(2)) - 1, col - 1


def excel_serial_date(value):
    return (datetime.datetime(1899, 12, 30) + datetime.timedelta(days=float(value))).date()


def parse_date(value):
    raw = str(value or "").replace("\t", "").strip()
    if not raw:
        return None, raw

    if re.fullmatch(r"\d+(\.0+)?", raw):
        return excel_serial_date(raw).isoformat(), raw

    match = re.search(r"(\d{1,2})[\-/\.](\d{1,2})[\-/\.](\d{2,4})", raw)
    if not match:
        return None, raw

    month = int(match.group(1))
    day = int(match.group(2))
    year = int(match.group(3))
    if year < 100:
        year = 1900 + year if year >= 30 else 2000 + year

    try:
        return datetime.date(year, month, day).isoformat(), raw
    except ValueError:
        return None, raw


def load_cells(workbook_path):
    with zipfile.ZipFile(workbook_path) as archive:
        shared_strings = []
        if "xl/sharedStrings.xml" in archive.namelist():
            shared_xml = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            for item in shared_xml.findall("a:si", NS):
                shared_strings.append("".join(text.text or "" for text in item.findall(".//a:t", NS)))

        sheet_xml = ET.fromstring(archive.read("xl/worksheets/sheet1.xml"))
        cells = {}
        for cell in sheet_xml.findall(".//a:c", NS):
            ref = cell.attrib["r"]
            value_node = cell.find("a:v", NS)
            value = "" if value_node is None else value_node.text

            if cell.attrib.get("t") == "s" and value:
                value = shared_strings[int(value)]
            elif cell.attrib.get("t") == "inlineStr":
                inline_text = cell.find("a:is/a:t", NS)
                value = "" if inline_text is None else inline_text.text

            row, col = cell_position(ref)
            cells[(row, col)] = value

        return cells


def build_birthdays(cells, workbook_path):
    blocks = []
    for col in range(60):
        label = str(cells.get((1, col), "")).strip().lower()
        if label in MONTH_ALIASES:
            month_number, month_name = MONTH_ALIASES[label]
            blocks.append({
                "month_number": month_number,
                "month_name": month_name,
                "serial_col": col,
                "name_col": col + 1,
                "dob_col": col + 2,
            })

    entries = []
    invalid_rows = []
    for block in blocks:
        for row in range(3, 1100):
            name = str(cells.get((row, block["name_col"]), "")).strip()
            dob_value = cells.get((row, block["dob_col"]))
            serial_number = str(cells.get((row, block["serial_col"]), "")).strip()
            if not name and not dob_value:
                continue
            if not name or not dob_value:
                continue
            if name.strip().lower() == "name" or str(dob_value).strip().lower() in {"d.o.b.", "dob", "date of birth"}:
                continue

            iso_date, raw_date = parse_date(dob_value)
            if not iso_date:
                invalid_rows.append({
                    "row": row + 1,
                    "month": block["month_name"],
                    "name": name,
                    "dob": raw_date,
                })
                continue

            slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:40]
            entries.append({
                "id": f"excel-{block['month_number']:02d}-{row + 1}-{slug}",
                "source": workbook_path.name,
                "source_sheet": "Sheet1",
                "source_row": row + 1,
                "source_month": block["month_name"],
                "serial_no": serial_number[:-2] if serial_number.endswith(".0") else serial_number,
                "person_name": name,
                "client_name": name,
                "person_type": "Imported Client",
                "date_of_birth": iso_date,
                "raw_date": raw_date,
            })

    return sorted(entries, key=lambda item: (item["date_of_birth"][5:], item["person_name"].lower())), invalid_rows


def add_manual_birthdays(entries):
    existing_keys = {
        (entry["person_name"].strip().lower(), entry["date_of_birth"])
        for entry in entries
    }

    for name, raw_date in MANUAL_BIRTHDAYS:
        iso_date, _ = parse_date(raw_date)
        if not iso_date:
            raise ValueError(f"Invalid manual birthday for {name}: {raw_date}")

        key = (name.strip().lower(), iso_date)
        if key in existing_keys:
            continue

        slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:40]
        entries.append({
            "id": f"manual-{slug}",
            "source": "Manual Entry",
            "source_sheet": "",
            "source_row": "",
            "source_month": datetime.date.fromisoformat(iso_date).strftime("%B"),
            "serial_no": "",
            "person_name": name,
            "client_name": name,
            "person_type": "Imported Client",
            "date_of_birth": iso_date,
            "raw_date": raw_date,
        })
        existing_keys.add(key)

    return sorted(entries, key=lambda item: (item["date_of_birth"][5:], item["person_name"].lower()))


def main():
    workbook_path = Path(sys.argv[1]) if len(sys.argv) > 1 else next(
        (path for path in DEFAULT_WORKBOOK_CANDIDATES if path.exists()),
        DEFAULT_WORKBOOK_CANDIDATES[-1],
    )

    if not workbook_path.exists():
        raise FileNotFoundError(f"Birthday workbook not found: {workbook_path}")

    cells = load_cells(workbook_path)
    entries, invalid_rows = build_birthdays(cells, workbook_path)
    entries = add_manual_birthdays(entries)
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(
        json.dumps(
            {
                "source": workbook_path.name,
                "generated_at": datetime.datetime.now().isoformat(timespec="seconds"),
                "count": len(entries),
                "entries": entries,
                "invalid_rows": invalid_rows,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"Imported {len(entries)} birthdays into {OUTPUT_PATH}")
    if invalid_rows:
        print(f"Skipped {len(invalid_rows)} rows without a complete DOB")


if __name__ == "__main__":
    main()
