"""Shared helpers for the PDF parsers."""
import json
import re
from pathlib import Path

import tabula

from schedule_metadata import DAYS, source_pdf, upcoming_pdf

COLUMN_TOLERANCE = 5

def _is_nan(value):
    return isinstance(value, float) and value != value

def nan_to_none(value):
    """Recursively replace NaN floats with None so the result serialises to valid JSON.

    pandas represents empty PDF cells as NaN. ``json.dump`` would write a bare
    ``NaN`` token, which is not valid JSON and breaks the browser's ``JSON.parse``.
    """
    if _is_nan(value):
        return None
    if isinstance(value, dict):
        return {k: nan_to_none(v) for k, v in value.items()}
    if isinstance(value, list):
        return [nan_to_none(v) for v in value]
    return value

def write_schedule(parse_pdf, pdf_path, output_path):
    print(f"Parsing schedule from {pdf_path}...")
    data = nan_to_none(parse_pdf(str(pdf_path)))
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=4, allow_nan=False)
    print(f"Successfully saved {len(data)} entries to {output_path}")

def write_upcoming_schedule(parse_pdf, pdf_path, output_path):
    if not pdf_path.exists():
        output_path.unlink(missing_ok=True)
        return
    try:
        write_schedule(parse_pdf, pdf_path, output_path)
    except Exception as exc:
        print(f"Warning: skipping upcoming schedule {pdf_path}: {exc}")
        output_path.unlink(missing_ok=True)

def run_parser(pool_name, parse_pdf, directory="."):
    directory = Path(directory)
    write_schedule(parse_pdf, source_pdf(pool_name, directory), directory / f"{pool_name}_data.json")
    write_upcoming_schedule(parse_pdf, upcoming_pdf(pool_name, directory), directory / f"{pool_name}_next_data.json")

def positioned_cells(row):
    return [{"left": cell["left"], "right": cell["left"] + cell["width"],
             "text": re.sub(r"\s+", " ", cell["text"]).strip()}
            for cell in row if cell["width"] > 0]

def read_table_rows(pdf_path):
    try:
        tables = tabula.read_pdf(pdf_path, pages="all", multiple_tables=True, lattice=True, output_format="json")
    except Exception:
        tables = []
    return [positioned_cells(row) for table in tables for row in table["data"]]

def day_columns(cells):
    return {cell["text"]: (cell["left"], cell["right"]) for cell in cells if cell["text"] in DAYS}

def row_labels(cells, columns):
    first_day_left = min(left for left, _ in columns.values())
    return [cell["text"] for cell in cells if cell["left"] < first_day_left - COLUMN_TOLERANCE]

def values_by_day(cells, columns):
    values = {}
    for cell in cells:
        if not cell["text"]:
            continue
        for day, (left, right) in columns.items():
            if cell["left"] < right - COLUMN_TOLERANCE and cell["right"] > left + COLUMN_TOLERANCE:
                values[day] = cell["text"]
    return values
