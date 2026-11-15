import re
import tabula
from pdf_utils import run_parser

DAYS = ["Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek", "Sobota", "Niedziela"]
TIME_RE = re.compile(r"^\d{1,2}[:.]\d{2}")
COLUMN_TOLERANCE = 5

def read_table_rows(pdf_path):
    try:
        tables = tabula.read_pdf(pdf_path, pages="all", multiple_tables=True, lattice=True, output_format="json")
    except Exception:
        tables = []
    return [positioned_cells(row) for table in tables for row in table["data"]]

def positioned_cells(row):
    return [{"left": cell["left"], "right": cell["left"] + cell["width"],
             "text": re.sub(r"\s+", " ", cell["text"]).strip()}
            for cell in row if cell["width"] > 0]

def day_columns(cells):
    return {cell["text"]: (cell["left"], cell["right"]) for cell in cells if cell["text"] in DAYS}

def values_by_day(cells, columns):
    values = {}
    for cell in cells:
        if not cell["text"]:
            continue
        for day, (left, right) in columns.items():
            if cell["left"] < right - COLUMN_TOLERANCE and cell["right"] > left + COLUMN_TOLERANCE:
                values[day] = cell["text"]
    return values

def lane_text(sport_value, recreational_value):
    if not sport_value.isdigit():
        return sport_value
    free_lanes = int(sport_value)
    text = f"{free_lanes}x25m wolne" if free_lanes > 0 else "0 wolnych torów"
    return f"{text} (rekreacyjny: {recreational_value})" if recreational_value else text

def parse_neptun_pdf(pdf_path):
    rows = read_table_rows(pdf_path)
    if not rows:
        print("No tables found in Neptun PDF.")
        return []

    schedule = []
    columns = {}
    current_time = None
    recreational = {}

    for cells in rows:
        columns = day_columns(cells) or columns
        if not columns or not cells:
            continue
        first_day_left = min(left for left, _ in columns.values())
        labels = [cell["text"] for cell in cells if cell["left"] < first_day_left - COLUMN_TOLERANCE]
        times = [label for label in labels if TIME_RE.match(label)]
        if times:
            current_time = times[0]
        if not current_time:
            continue

        label_text = " ".join(labels).lower()
        if "rekreacyjny" in label_text:
            recreational = values_by_day(cells, columns)
        elif "sportowy" in label_text:
            sport = values_by_day(cells, columns)
            schedule.append({"time": current_time, "days": {
                day: lane_text(sport[day], recreational.get(day)) if day in sport else None for day in DAYS}})

    return schedule

if __name__ == "__main__":
    run_parser("neptun", parse_neptun_pdf)
