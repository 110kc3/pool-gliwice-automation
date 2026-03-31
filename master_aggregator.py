import json

def aggregate_data(file_paths, output_path):
    aggregated = []
    
    for pool_name, file_path in file_paths.items():
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                # Ensure the data has the name field
                if "name" not in data:
                    data["name"] = pool_name.capitalize()
                aggregated.append(data)
        except FileNotFoundError:
            print(f"Warning: {file_path} not found. Skipping.")
        except json.JSONDecodeError:
            print(f"Warning: Failed to parse {file_path}. Skipping.")
            
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(aggregated, f, ensure_ascii=False, indent=4)
    print(f"Successfully aggregated data to {output_path}")

if __name__ == "__main__":
    files = {
        "mewa": "mewa_data.json",
        "delfin": "delfin_data.json",
        "olimpijczyk": "olimpijczyk_data.json"
    }
    aggregate_data(files, "all_pools_data.json")
