import glob
import json
import os
import re
import pandas as pd
import tabula
from pdf_utils import nan_to_none

def parse_neptun_pdf(pdf_path):
    """
    Parses the weekly schedule PDF for Kryta Pływalnia Neptun (ul. Dzionkarzy 29).
    The PDF contains 15-minute slot entries across 2 tables for:
      - B. sportowy (6-lane 25m basin, 0-5 lanes available for public swimming)
      - B. rekreacyjny (small/recreational basin, 'wolny', 'zajęty', etc.)
    """
    try:
        tables = tabula.read_pdf(pdf_path, pages="all", multiple_tables=True, lattice=True, pandas_options={"header": None})
    except Exception:
        tables = []
    if not tables:
        tables = tabula.read_pdf(pdf_path, pages="all", multiple_tables=True, pandas_options={"header": None})

    if not tables:
        print("No tables found in Neptun PDF.")
        return []

    days = ["Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek", "Sobota", "Niedziela"]
    time_re = re.compile(r"^\d{1,2}[:.]\d{2}")
    schedule = []

    for df in tables:
        current_time = None
        rekreacyjny_info = {}

        for _, row in df.iterrows():
            col0 = str(row[0]).strip() if not pd.isna(row[0]) else ""
            col1 = str(row[1]).strip() if len(row) > 1 and not pd.isna(row[1]) else ""

            if time_re.match(col0):
                current_time = col0

            if not current_time:
                continue

            if "rekreacyjny" in col1.lower():
                rekreacyjny_info = {}
                for d_idx, d_name in enumerate(days):
                    col_i = d_idx + 2
                    val = str(row[col_i]).strip() if col_i < len(row) and not pd.isna(row[col_i]) else None
                    if val and val.lower() != "nan":
                        rekreacyjny_info[d_name] = val

            elif "sportowy" in col1.lower():
                day_data = {}
                for d_idx, d_name in enumerate(days):
                    col_i = d_idx + 2
                    val = str(row[col_i]).strip() if col_i < len(row) and not pd.isna(row[col_i]) else None
                    if val and val.lower() != "nan":
                        rek_val = rekreacyjny_info.get(d_name)
                        if val.isdigit():
                            num = int(val)
                            if num > 0:
                                lane_str = f"{num}x25m wolne"
                            else:
                                lane_str = "0 wolnych torów"
                            if rek_val and rek_val.lower() != "nan":
                                lane_str += f" (rekreacyjny: {rek_val})"
                            day_data[d_name] = lane_str
                        else:
                            day_data[d_name] = val
                    else:
                        day_data[d_name] = None

                schedule.append({
                    "time": current_time,
                    "days": day_data
                })

    return schedule

if __name__ == "__main__":
    neptun_candidates = sorted(glob.glob("Harmonogram_Neptun_*.pdf") + glob.glob("neptun.pdf"), key=os.path.getmtime, reverse=True)
    neptun_pdf_path = neptun_candidates[0] if neptun_candidates else "neptun.pdf"
    print(f"Parsing Neptun schedule from {neptun_pdf_path}...")
    data = nan_to_none(parse_neptun_pdf(neptun_pdf_path))

    with open("neptun_data.json", "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=4, allow_nan=False)
    print(f"Successfully saved {len(data)} entries to neptun_data.json")
