import datetime
import json
import os
import re
from collections import defaultdict
import numpy as np
from zoneinfo import ZoneInfo
from pathlib import Path
from schedule_metadata import read_metadata, source_pdf, upcoming_pdf, lane_configuration

DAYS = ["Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek", "Sobota", "Niedziela"]
DAY_SET = set(DAYS)
_MONTHS = ("stycznia|lutego|marca|kwietnia|maja|czerwca|lipca|"
           "sierpnia|września|października|listopada|grudnia")
_DATE_RE = re.compile(r"^\d{1,2}\s+(" + _MONTHS + r")", re.IGNORECASE)
_NUMERIC_DATE_RE = re.compile(r"^\d{1,2}[./]\d{1,2}[./]\d{2,4}$")
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
        return False
    if s == "data":
        return True
    return any(k in s for k in ("harmonogram", "dzień", "tygodnia", "godzina", "ilość zajętych", "ilość wolnych"))

def is_noise_value(value):
    """An availability cell that is parser junk: a header, a date, a day name, or a stray letter."""
    s = clean_cell(value)
    if not s:
        return True
    if s in DAY_SET:
        return True
    if _DATE_RE.match(s) or _NUMERIC_DATE_RE.match(s):
        return True
    low = s.lower()
    if "ilość wolnych torów" in low or "ilość zajętych torów" in low:
        return True
    letters = _LETTERS_RE.sub("", s)
    if not any(ch.isdigit() for ch in s) and len(letters) < 5 and "wolne" not in low:
        return True
    return False

def transform_data(raw_data, dates_map=None, last_updated_pl=None, last_updated_iso=None):
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
    Optionally enriches each schedule slot with concrete calendar dates if dates_map is provided.
    Optionally includes last updated timestamps (last_updated_pl, last_updated_iso).
    """
    grouped = defaultdict(list)

    for entry in raw_data:
        if not isinstance(entry, dict):
            continue

        pool_name = entry.get("name", "Unknown")
        time_slot = entry.get("time", "")
        days_data = entry.get("days", {})

        if not days_data:
            continue

        if is_noise_time(time_slot):
            continue

        clean_time = clean_cell(time_slot)

        for day, lanes in days_data.items():
            if lanes is None or (isinstance(lanes, float) and np.isnan(lanes)):
                continue

            available_lanes = clean_cell(str(lanes))

            if is_noise_value(available_lanes):
                continue

            c_day = clean_cell(day)
            slot_entry = {
                "day": c_day,
                "time": clean_time,
                "availableLanes": available_lanes
            }
            if dates_map and c_day in dates_map:
                slot_entry["date"] = dates_map[c_day]

            grouped[pool_name].append(slot_entry)

    result = []
    week_range = f"{dates_map['Poniedziałek']} – {dates_map['Niedziela']}" if dates_map and 'Poniedziałek' in dates_map and 'Niedziela' in dates_map else None

    for name, schedule in grouped.items():
        pool_dict = {
            "name": name,
            "schedule": schedule
        }
        if dates_map:
            pool_dict["weekRange"] = week_range
            pool_dict["dates"] = dates_map
        if last_updated_pl:
            pool_dict["lastUpdated"] = last_updated_iso
            pool_dict["lastUpdatedPl"] = last_updated_pl
        result.append(pool_dict)
    return result

def parse_date(value):
    return datetime.datetime.strptime(value, "%d.%m.%Y")

def week_range(dates):
    values = sorted(set(dates.values()), key=parse_date)
    return f"{values[0]} – {values[-1]}" if values else None

def build_pools(pool_name, file_path, pdf, last_updated_pl, last_updated_iso):
    with open(file_path, encoding="utf-8") as f:
        raw = json.load(f)
    entries = raw if isinstance(raw, list) else [raw]
    entries = [dict(entry, name=pool_name.capitalize()) for entry in entries if isinstance(entry, dict)]
    dates, configurations = read_metadata(pdf)
    pools = transform_data(entries, dates, last_updated_pl, last_updated_iso)
    for pool in pools:
        pool["dates"] = dates
        pool["weekRange"] = week_range(dates)
        pool["sourcePdf"] = pdf.name
        if pool_name.lower() == "olimpijczyk":
            for entry in pool["schedule"]:
                config = configurations.get(entry["day"])
                if config:
                    entry.update(lane_configuration(entry["availableLanes"], config))
    return pools

def starts_after(upcoming_dates, current_dates):
    if not upcoming_dates:
        return False
    if not current_dates:
        return True
    return min(map(parse_date, upcoming_dates.values())) > max(map(parse_date, current_dates.values()))

def append_upcoming_week(pool, upcoming):
    if not starts_after(upcoming["dates"], pool["dates"]):
        return
    pool["schedule"].extend(entry for entry in upcoming["schedule"] if "date" in entry)
    pool["upcomingWeekRange"] = upcoming["weekRange"]
    pool["upcomingSourcePdf"] = upcoming["sourcePdf"]

def aggregate_data(file_paths, output_path):
    transformed = []
    now_utc = datetime.datetime.now(datetime.timezone.utc)
    last_updated_iso = now_utc.isoformat()
    last_updated_pl = now_utc.astimezone(ZoneInfo("Europe/Warsaw")).strftime("%d.%m.%Y, %H:%M")

    for pool_name, file_path in file_paths.items():
        directory = Path(file_path).parent
        pools = build_pools(pool_name, file_path, source_pdf(pool_name, directory), last_updated_pl, last_updated_iso)
        upcoming_data = directory / f"{pool_name}_next_data.json"
        upcoming_source = upcoming_pdf(pool_name, directory)
        if upcoming_data.exists() and upcoming_source.exists():
            upcoming_pools = build_pools(pool_name, upcoming_data, upcoming_source, last_updated_pl, last_updated_iso)
            for pool, upcoming in zip(pools, upcoming_pools):
                append_upcoming_week(pool, upcoming)
        for pool in pools:
            ranges = [r for r in (pool["weekRange"], pool.get("upcomingWeekRange")) if r]
            print(f"{pool['name']}: {', '.join(ranges) or 'unknown dates'}")
        transformed.extend(pools)

    payload = json.dumps(transformed, ensure_ascii=False, indent=1, allow_nan=False)
    destination = Path(output_path)
    temporary = destination.with_suffix(destination.suffix + ".tmp")
    temporary.write_text(payload, encoding="utf-8")
    os.replace(temporary, destination)
    print(f"Successfully aggregated {len(transformed)} pools to {output_path} (Updated: {last_updated_pl})")

if __name__ == "__main__":
    files = {
        "mewa": "mewa_data.json",
        "delfin": "delfin_data.json",
        "olimpijczyk": "olimpijczyk_data.json",
        "neptun": "neptun_data.json"
    }
    aggregate_data(files, "data.json")
