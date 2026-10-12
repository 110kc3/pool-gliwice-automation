import json
import re
from collections import defaultdict
import numpy as np

DAYS = ["Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek", "Sobota", "Niedziela"]
DAY_SET = set(DAYS)
_MONTHS = ("stycznia|lutego|marca|kwietnia|maja|czerwca|lipca|"
           "sierpnia|września|października|listopada|grudnia")
_DATE_RE = re.compile(r"^\d{1,2}\s+(" + _MONTHS + r")", re.IGNORECASE)
_LETTERS_RE = re.compile(r"[^a-zA-Ząćęłńóśźż]", re.IGNORECASE)


def clean_cell(value):
    """Strip stray carriage returns left by the PDF parser and collapse whitespace."""
    if not isinstance(value, str):
        return ""
    return re.sub(r"\s+", " ", value.replace("\r", " ")).strip()


def is_noise_time(time_str):
    """A time slot that is actually a header/date row rather than a real time range."""
    s = clean_cell(time_str).lower()
    if not s:
        return False  # empty time is a real (if incomplete) entry, not noise
    if s == "data":
        return True
    return any(k in s for k in ("harmonogram", "dzień", "tygodnia", "godzina"))


def is_noise_value(value):
    """An availability cell that is parser junk: a header, a date, a day name, or a stray letter."""
    s = clean_cell(value)
    if not s:
        return True
    if s in DAY_SET:
        return True
    if _DATE_RE.match(s):
        return True
    low = s.lower()
    if "ilość wolnych torów" in low:
        return True
    # Stray short-letter artifacts (e.g. "n", "a", mangled "Pływ") with no digit.
    letters = _LETTERS_RE.sub("", s)
    if not any(ch.isdigit() for ch in s) and len(letters) < 5 and "wolne" not in low:
        return True
    return False


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
        # Skip entries that are not dictionaries (e.g., None, strings) to avoid
        # AttributeError when accessing keys. Raw data may contain malformed items.
        if not isinstance(entry, dict):
            continue

        pool_name = entry.get("name", "Unknown")
        time_slot = entry.get("time", "")
        days_data = entry.get("days", {})

        if not days_data:
            # Skip entries that do not contain any day schedule data.
            continue

        # Skip header/date rows masquerading as a time slot (e.g. "Data", "Dzień tygodnia").
        if is_noise_time(time_slot):
            continue

        clean_time = clean_cell(time_slot)

        for day, lanes in days_data.items():
            # Drop missing values: NaN floats and None carry no availability information.
            if lanes is None or (isinstance(lanes, float) and np.isnan(lanes)):
                continue

            available_lanes = clean_cell(str(lanes))

            # Drop parser junk (headers, dates, day names, stray letters) so data.json
            # is clean at rest rather than relying on the frontend to filter it.
            if is_noise_value(available_lanes):
                continue

            grouped[pool_name].append({
                "day": clean_cell(day),
                "time": clean_time,
                "availableLanes": available_lanes
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
                        if not isinstance(entry, dict):
                            print(f"Warning: Skipping non-dictionary item in {file_path}.")
                            continue
                        if "name" not in entry:
                            entry["name"] = pool_name.capitalize()
                        all_raw_data.append(entry)
                elif isinstance(data, dict):
                    if "name" not in data:
                        data["name"] = pool_name.capitalize()
                    all_raw_data.append(data)
        except json.JSONDecodeError as e:
            print(f"Error: Failed to decode JSON from {file_path} due to JSON error: {e}")
        except FileNotFoundError:
            print(f"Warning: File not found at {file_path}. Skipping.")
        except Exception as e:
            # Catch any other unexpected error during file processing (e.g., permissions, encoding issues)
            print(f"Error: An unexpected error occurred while processing {file_path}: {e}")

    transformed = transform_data(all_raw_data)

    with open(output_path, 'w', encoding='utf-8') as f:
        # allow_nan=False guarantees standards-compliant JSON: a stray NaN/Infinity
        # raises here instead of producing a file the browser's JSON.parse rejects.
        json.dump(transformed, f, ensure_ascii=False, indent=4, allow_nan=False)
    print(f"Successfully aggregated data to {output_path}")

if __name__ == "__main__":
    files = {
        "mewa": "mewa_data.json",
        "delfin": "delfin_data.json",
        "olimpijczyk": "olimpijczyk_data.json"
    }
    aggregate_data(files, "data.json")