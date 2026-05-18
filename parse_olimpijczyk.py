import tabula
import json
import pandas as pd

def parse_olimpijczyk_pdf(pdf_path):
    # Extract tables from the PDF
    # Based on the PDF structure, the table starts after the header rows.
    # We will read all pages and concatenate if needed, but here it looks like a single table.
    tables = tabula.read_pdf(pdf_path, pages='all', multiple_tables=True, pandas_options={'header': None})

    if not tables:
        print("No tables found in Olimpijczyk PDF.")
        return []

    # The first table seems to hold the main schedule
    df = tables[0]

    # Clean up: the PDF structure is a bit messy, we need to focus on rows with time
    # Time is in the first column. Days are in columns 1-7.
    # Skip rows that are clearly headers or footers based on the PDF content
    
    schedule = []
    
    # Process rows
    for _, row in df.iterrows():
        time = row[0]
        if pd.isna(time) or not isinstance(time, str):
            continue
            
        # Standardize day keys to Polish and use nested dictionary structure
        day_data = {
            "time": time.strip(),
            "days": {
                "Poniedziałek": row[1] if len(row) > 1 else None,
                "Wtorek": row[2] if len(row) > 2 else None,
                "Środa": row[3] if len(row) > 3 else None,
                "Czwartek": row[4] if len(row) > 4 else None,
                "Piątek": row[5] if len(row) > 5 else None,
                "Sobota": row[6] if len(row) > 6 else None,
                "Niedziela": row[7] if len(row) > 7 else None,
            }
        }
        schedule.append(day_data)
    
    return schedule

if __name__ == "__main__":
    import re
    olimpijczyk_pdf_path = "Harmonogram_Olimpijczyk_30_03-05_04_2026.pdf"
    data = parse_olimpijczyk_pdf(olimpijczyk_pdf_path)
    
    # Save to JSON
    with open('olimpijczyk_data.json', 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=4)
    print("Successfully saved data to olimpijczyk_data.json")
