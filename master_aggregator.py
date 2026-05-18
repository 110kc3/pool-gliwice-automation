import json
from collections import defaultdict

def transform_data(raw_data):
    """
    Transforms a list of entries formatted as:
    {
        "time": "7.00- 8.00",
        "days": {"Poniedziałek": "...", "Wtorek": "..."},
        "name": "Mewa"
    }
    into:
    [
        {
            "name": "Mewa",
            "schedule": [
                {"day": "Poniedziałek", "time": "7.00- 8.00", "availableLanes": "..."},
                ...
            ]
        },
        ...
    ]
    """
    grouped = defaultdict(list)
    
    for entry in raw_data:
        pool_name = entry.get("name", "Unknown")
        time_slot = entry.get("time", "")
        days_data = entry.get("days", {})
        
        for day, lanes in days_data.items():
            # Skip invalid/empty entries if necessary
            if lanes is None or (isinstance(lanes, float) and str(lanes) == 'nan'):
                continue
                
            grouped[pool_name].append({
                "day": day,
                "time": time_slot,
                "availableLanes": str(lanes)
            })
            
    result = []
    for name, schedule in grouped.items():
        result.append({
            "name": name,
            "schedule": schedule
        })
    return result

def aggregate_data(file_paths, output_path):
    all_raw_data = []
    
    for pool_name, file_path in file_paths.items():
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                if isinstance(data, list):
                    for entry in data:
                        if isinstance(entry, dict) and "name" not in entry:
                            entry["name"] = pool_name.capitalize()
                        all_raw_data.append(entry)
                elif isinstance(data, dict):
                    if "name" not in data:
                        data["name"] = pool_name.capitalize()
                    all_raw_data.append(data)
        except Exception as e:
            print(f"Warning: Could not process {file_path}: {e}")
            
    transformed = transform_data(all_raw_data)
            
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(transformed, f, ensure_ascii=False, indent=4)
    print(f"Successfully aggregated data to {output_path}")

if __name__ == "__main__":
    files = {
        "mewa": "mewa_data.json",
        "delfin": "delfin_data.json",
        "olimpijczyk": "olimpijczyk_data.json"
    }
    aggregate_data(files, "data.json")
