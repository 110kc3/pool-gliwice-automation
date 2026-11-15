import re
from pdf_utils import day_columns, read_table_rows, row_labels, run_parser, values_by_day
from schedule_metadata import DAYS

TIME_RE = re.compile(r"^\d{1,2}[:.]\d{2}")

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
        labels = row_labels(cells, columns)
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
