import re
from pdf_utils import day_columns, read_table_rows, row_labels, run_parser, values_by_day
from schedule_metadata import DAYS

TIME_RE = re.compile(r"^\d{1,2}[:.]\d{2}(\s*-\s*\d{1,2}[:.]\d{2})?$")
LETTERS_RE = re.compile(r"[^a-zA-Ząćęłńóśźż]")

def is_availability(value):
    lowered = value.lower()
    return (any(character.isdigit() for character in value) or len(LETTERS_RE.sub("", value)) >= 5
            or "wolne" in lowered or "dostępna" in lowered)

def parse_olimpijczyk_pdf(pdf_path):
    rows = read_table_rows(pdf_path)
    if not rows:
        print("No tables found in Olimpijczyk PDF.")
        return []

    schedule = []
    columns = {}
    for cells in rows:
        columns = day_columns(cells) or columns
        if not columns or not cells:
            continue
        times = [label for label in row_labels(cells, columns) if TIME_RE.match(label)]
        if not times:
            continue
        values = values_by_day(cells, columns)
        schedule.append({"time": times[0], "days": {
            day: values[day] if day in values and is_availability(values[day]) else None for day in DAYS}})

    return schedule

if __name__ == "__main__":
    run_parser("olimpijczyk", parse_olimpijczyk_pdf)
