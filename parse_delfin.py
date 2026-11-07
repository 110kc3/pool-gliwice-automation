import glob
import json
import os
import re
import pandas as pd
import tabula
from pdf_utils import nan_to_none

def parse_delfin_pdf(pdf_path):
    """
    Parses Delfin swimming pool schedule PDF.
    Handles both legacy single-table layouts and modern multi-table layouts across all pages.
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
        print("No tables found in Delfin PDF.")
        return []

    days_of_week = ["Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek", "Sobota", "Niedziela"]
    time_pattern = re.compile(r"^\d{1,2}[:.]\d{2}(\s*-\s*\d{1,2}[:.]\d{2})?$")
    pool_schedule = []

    # Check if legacy single table format (e.g. single table with "Godziny" in header)
    df0 = tables[0]
    header_row_index = -1
    for r_idx, row in df0.iterrows():
        cell0 = str(row.iloc[0]).lower()
        if "godzin" in cell0:
            header_row_index = r_idx
            break

    if len(tables) == 1 and header_row_index != -1 and any("poniedziałek" in str(x).lower() for x in df0.iloc[header_row_index].tolist()):
        headers = [str(x).strip() for x in df0.iloc[header_row_index].tolist()]
        df_data = df0.iloc[header_row_index + 1:].copy()
        df_data.columns = headers
        time_column = headers[0]
        for col in df_data.columns:
            if re.match(r"\d{1,2}\.\d{2}-\s*\d{1,2}\.\d{2}", str(df_data[col].iloc[0])):
                time_column = col
                break
        for _, row in df_data.iterrows():
            time_slot = str(row[time_column]).strip()
            if not re.match(r"\d{1,2}\.\d{2}-\s*\d{1,2}\.\d{2}", time_slot):
                continue
            days_data = {}
            for day in days_of_week:
                try:
                    day_index = headers.index(day)
                    raw = row.iloc[day_index]
                    day_content = None if pd.isna(raw) else str(raw)
                except ValueError:
                    day_content = None
                days_data[day] = day_content
            pool_schedule.append({"time": time_slot, "days": days_data})
        if pool_schedule:
            return pool_schedule

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
            pool_schedule.append({"time": time_val, "days": days_data})

    return pool_schedule

if __name__ == "__main__":
    candidates = sorted(glob.glob("Harmonogram_Delfin_*.pdf") + glob.glob("delfin.pdf"), key=os.path.getmtime, reverse=True)
    delfin_pdf_path = candidates[0] if candidates else "delfin.pdf"
    print(f"Parsing Delfin schedule from {delfin_pdf_path}...")
    data = nan_to_none(parse_delfin_pdf(delfin_pdf_path))

    with open("delfin_data.json", "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=4, allow_nan=False)
    print(f"Successfully saved {len(data)} entries to delfin_data.json")
