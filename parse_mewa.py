import tabula
import json
import re
import pandas as pd

def parse_mewa_pdf(pdf_path):
    # Extract tables from the PDF
    tables = tabula.read_pdf(pdf_path, pages='all', multiple_tables=True, 
                             pandas_options={'header': None})

    if not tables:
        print("No tables found in Mewa PDF.")
        return []

    # Process table (assuming first table contains the schedule)
    df = tables[0]
    
    # Define column names
    df.columns = ['Godziny', 'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota', 'Niedziela']
    
    # Define time slot pattern: digit(s), dot/optional digit, separator, digit(s), dot/optional digit
    # e.g., '7.00- 8.00'
    time_pattern = re.compile(r'^\d{1,2}(\.\d{2})?\s*-\s*\d{1,2}(\.\d{2})?$')
    
    # Helper to clean and validate row
    def is_valid_row(row):
        val = row['Godziny']
        if pd.isna(val) or not isinstance(val, str):
            return False
        # Strip whitespace for check
        clean_val = val.strip()
        # Must match time pattern
        if not time_pattern.match(clean_val):
            return False
        # Additional filter: check if first column contains header text
        if "Godziny" in clean_val or "HARMONOGRAM" in clean_val or "Miesiąc" in clean_val or "Rok" in clean_val:
            return False
        return True

    # Filter rows
    df_clean = df[df.apply(is_valid_row, axis=1)].copy()
    
    schedule = []
    
    for _, row in df_clean.iterrows():
        entry = {
            'time': row['Godziny'].strip(),
            'days': {
                'Poniedziałek': row['Poniedziałek'],
                'Wtorek': row['Wtorek'],
                'Środa': row['Środa'],
                'Czwartek': row['Czwartek'],
                'Piątek': row['Piątek'],
                'Sobota': row['Sobota'],
                'Niedziela': row['Niedziela']
            }
        }
        schedule.append(entry)
    
    return schedule

if __name__ == "__main__":
    mewa_pdf_path = "mewa.pdf"
    data = parse_mewa_pdf(mewa_pdf_path)
    
    with open('mewa_data.json', 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=4)
    print("Successfully saved data to mewa_data.json")
