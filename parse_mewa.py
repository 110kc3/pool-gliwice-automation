import glob
import json
import os
import re
import pandas as pd
import tabula
from pdf_utils import nan_to_none

def parse_mewa_pdf(pdf_path):
    """
    Parses Mewa swimming pool schedule PDF.
    Supports both legacy single-table layouts and modern multi-table layouts across all pages.
    """
    try:
        tables = tabula.read_pdf(pdf_path, pages="all", multiple_tables=True, lattice=True, pandas_options={"header": None})
    except Exception:
        tables = []
    if not tables:
        try:
            tables = tabula.read_pdf(pdf_path, pages="all", multiple_tables=True, pandas_options={"header": None})
        except Exception:
            tables = []

    if not tables:
        print("No tables found in Mewa PDF.")
        return []

    days_of_week = ["Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek", "Sobota", "Niedziela"]
    time_pattern = re.compile(r"^\d{1,2}[:.]\d{2}(\s*-\s*\d{1,2}[:.]\d{2})?$")
    schedule = []

    # Check if legacy single table format (e.g. 8 columns with "Godziny" in header row)
    df0 = tables[0]
    if len(tables) == 1 and df0.shape[1] == 8:
        # Check if row 0 is header
        first_row_str = " ".join(str(x).lower() for x in df0.iloc[0].tolist())
        if "godzin" in first_row_str:
            df0_data = df0.iloc[1:].copy()
        else:
            df0_data = df0.copy()
        for _, row in df0_data.iterrows():
            time_val = str(row.iloc[0]).strip() if not pd.isna(row.iloc[0]) else ""
            if not time_pattern.match(time_val) or any(k in time_val.lower() for k in ("czas", "koniec", "godzina", "ilość", "data")):
                continue
            days_data = {}
            for i, d in enumerate(days_of_week):
                col_i = i + 1
                val = row.iloc[col_i] if col_i < len(row) else None
                days_data[d] = None if (pd.isna(val) or str(val).strip().lower() in ("nan", "none", "")) else str(val).strip()
            schedule.append({"time": time_val, "days": days_data})
        if schedule:
            return schedule

    # Multi-table or modernized format: dynamically find time column in each row
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

            time_val = str(row.iloc[time_col]).strip()
            days_data = {}
            for i, d in enumerate(days_of_week):
                col_i = time_col + 1 + i
                if col_i < len(row):
                    val = row.iloc[col_i]
                    days_data[d] = None if (pd.isna(val) or str(val).strip().lower() in ("nan", "none", "")) else str(val).strip()
                else:
                    days_data[d] = None
            schedule.append({"time": time_val, "days": days_data})

    return schedule

if __name__ == "__main__":
    candidates = sorted(glob.glob("Harmonogram_Mewa_*.pdf") + glob.glob("mewa.pdf"), key=os.path.getmtime, reverse=True)
    mewa_pdf_path = candidates[0] if candidates else "mewa.pdf"
    print(f"Parsing Mewa schedule from {mewa_pdf_path}...")
    data = nan_to_none(parse_mewa_pdf(mewa_pdf_path))

    with open("mewa_data.json", "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=4, allow_nan=False)
    print(f"Successfully saved {len(data)} entries to mewa_data.json")
