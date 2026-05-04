
import tabula
import json
import re

def parse_delfin_pdf(pdf_path):
    # Extract tables from the PDF without area restriction for debugging
    tables = tabula.read_pdf(pdf_path, pages='all', multiple_tables=True, 
                             pandas_options={'header': None})

    if not tables:
        print("No tables found.")
        return []
    
    for i, table in enumerate(tables):
        print(f"--- Table {i} ---")
        print(table.to_string())
    
    df = tables[0]
    
    # Clean up column names - the first row should be the header
    # df.columns = df.iloc[0]
    # df = df[1:].reset_index(drop=True)
    
    # Days of the week in Polish, as they appear in the PDF
    days_of_week = ["Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek", "Sobota", "Niedziela"]
    days_map = {
        "Poniedziałek": "Monday",
        "Wtorek": "Tuesday",
        "Środa": "Wednesday",
        "Czwartek": "Thursday",
        "Piątek": "Friday",
        "Sobota": "Saturday",
        "Niedziela": "Sunday"
    }
    # We need to map the columns to the correct days. 
    # Based on the PDF, the first column is "Godziny" (Hours)
    # and then the days follow.
    
    # Let's manually define the structure based on the PDF content
    # The first column will be "Godziny" (Time)
    # The subsequent 7 columns are days of the week
    
    # The actual column names from the PDF are in the second row for days, and first for "Godziny"
    # So, we need to carefully extract the header information.

    # Let's assume the first row contains "Godziny" and days of the week
    # Need to find the row that contains "Godziny" and the days of the week
    
    header_row_index = -1
    for r_idx, row in df.iterrows():
        if "Godziny" in str(row.iloc[0]):
            header_row_index = r_idx
            break

    if header_row_index == -1:
        print("Could not find header row.")
        return []

    # Extract header (days of the week and "Godziny")
    headers = [str(x).strip() for x in df.iloc[header_row_index].tolist()]
    
    # The actual data starts after the header row
    df_data = df.iloc[header_row_index + 1:].copy()
    df_data.columns = headers
    
    # The "Godziny" column might be named differently or merged, let's find the one that contains time patterns
    time_column = None
    for col in df_data.columns:
        if re.match(r'\d{1,2}\.\d{2}-\s*\d{1,2}\.\d{2}', str(df_data[col].iloc[0])):
            time_column = col
            break
    
    if not time_column:
        time_column = headers[0] # Assume the first column is time if no clear pattern match
    
    
    pool_schedule = []

    for _, row in df_data.iterrows():
        time_slot = str(row[time_column]).strip()
        if not re.match(r'\d{1,2}\.\d{2}-\s*\d{1,2}\.\d{2}', time_slot):
            continue

        days_data = {}
        for day in days_of_week:
            try:
                day_index = headers.index(day)
                day_content = str(row.iloc[day_index])
            except ValueError:
                day_content = ""
            
            days_data[day] = day_content

        pool_schedule.append({
            'time': time_slot,
            'days': days_data
        })
    
    return pool_schedule


if __name__ == "__main__":
    delfin_pdf_path = "delfin.pdf"
    data = parse_delfin_pdf(delfin_pdf_path)
    
    with open('delfin_data.json', 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=4)
    print("Successfully saved data to delfin_data.json")
