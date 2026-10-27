import glob
import json
import os
import re
import pandas as pd
import tabula
from pdf_utils import nan_to_none

def parse_olimpijczyk_pdf(pdf_path):
    """
    Extracts schedule data from all pages/tables of the Olimpijczyk PDF timetable.
    Iterates through all extracted tables to capture the complete day (06:00 - 22:00),
    not just the morning table.
    """
    try:
        tables = tabula.read_pdf(pdf_path, pages="all", multiple_tables=True, lattice=True, pandas_options={"header": None})
    except Exception:
        tables = []
    if not tables:
        tables = tabula.read_pdf(pdf_path, pages="all", multiple_tables=True, pandas_options={"header": None})

    if not tables:
        print("No tables found in Olimpijczyk PDF.")
        return []

    time_pattern = re.compile(r"^\d{1,2}[:.]\d{2}(\s*-\s*\d{1,2}[:.]\d{2})?$")
    schedule = []

    def clean_day_val(val):
        if pd.isna(val) or val is None:
            return None
        s = str(val).strip()
        # Filter out short stray letter artifacts (e.g. "n", "a", "l", "P\rł\ry\rw") with no digits
        letters = re.sub(r"[^a-zA-Ząćęłńóśźż]", "", s)
        if not any(ch.isdigit() for ch in s) and len(letters) < 5 and "wolne" not in s.lower() and "dostępna" not in s.lower():
            return None
        return s

    for df in tables:
        for _, row in df.iterrows():
            time_col = None
            for c in range(min(4, len(row))):
                v = str(row.iloc[c]).strip() if not pd.isna(row.iloc[c]) else ""
                if time_pattern.match(v) and not any(k in v.lower() for k in ("czas", "koniec", "godzina", "ilość", "data")):
                    time_col = c
                    break

            if time_col is None:
                continue

            clean_time = str(row.iloc[time_col]).strip()
            day_data = {
                "time": clean_time,
                "days": {
                    "Poniedziałek": clean_day_val(row.iloc[time_col + 1]) if time_col + 1 < len(row) else None,
                    "Wtorek": clean_day_val(row.iloc[time_col + 2]) if time_col + 2 < len(row) else None,
                    "Środa": clean_day_val(row.iloc[time_col + 3]) if time_col + 3 < len(row) else None,
                    "Czwartek": clean_day_val(row.iloc[time_col + 4]) if time_col + 4 < len(row) else None,
                    "Piątek": clean_day_val(row.iloc[time_col + 5]) if time_col + 5 < len(row) else None,
                    "Sobota": clean_day_val(row.iloc[time_col + 6]) if time_col + 6 < len(row) else None,
                    "Niedziela": clean_day_val(row.iloc[time_col + 7]) if time_col + 7 < len(row) else None,
                }
            }
            schedule.append(day_data)

    return schedule

if __name__ == "__main__":
    candidates = sorted(glob.glob("Harmonogram_Olimpijczyk_*.pdf") + glob.glob("olimpijczyk.pdf"), key=os.path.getmtime, reverse=True)
    olimpijczyk_pdf_path = candidates[0] if candidates else "Harmonogram_Olimpijczyk_26.10.2026_-_01.11.2026.pdf"
    print(f"Parsing Olimpijczyk schedule from {olimpijczyk_pdf_path}...")
    data = nan_to_none(parse_olimpijczyk_pdf(olimpijczyk_pdf_path))

    with open("olimpijczyk_data.json", "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=4, allow_nan=False)
    print(f"Successfully saved {len(data)} entries to olimpijczyk_data.json")
