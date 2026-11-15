#!/usr/bin/env python3
import datetime
import re
import urllib.request
from pathlib import Path
from urllib.parse import urljoin, unquote
from zoneinfo import ZoneInfo

from schedule_metadata import PDF_FILES, UPCOMING_PDF_FILES

BASE_URLS = {
    "delfin": "https://sport.gliwice.eu/delfin",
    "mewa": "https://sport.gliwice.eu/mewa",
    "olimpijczyk": "https://sport.gliwice.eu/olimpijczyk",
    "neptun": "https://sport.gliwice.eu/neptun"
}

HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
SCHEDULE_LINK_RE = re.compile(r"href=[\"\x27]([^\x27\"]*Harmonogram[^\x27\"]*\.pdf)[\"\x27]", re.IGNORECASE)
MINIMUM_PDF_BYTES = 1000

def parse_filename_range(url):
    raw = unquote(url)
    m = re.search(r"(\d{1,2})[._]+(\d{1,2})[._]+(\d{4})\s*[-_]+\s*(\d{1,2})[._]+(\d{1,2})[._]+(\d{4})", raw)
    try:
        if m:
            d1, m1, y1, d2, m2, y2 = map(int, m.groups())
            return datetime.date(y1, m1, d1), datetime.date(y2, m2, d2)
        m2 = re.search(r"(\d{1,2})[._]+(\d{1,2})\s*[-_]+\s*(\d{1,2})[._]+(\d{1,2})[._]+(\d{4})", raw)
        if m2:
            d1, m1, d2, m2_m, y2 = map(int, m2.groups())
            return datetime.date(y2 - (m1 > m2_m), m1, d1), datetime.date(y2, m2_m, d2)
    except ValueError:
        return None
    return None

def select_best_link(matches, today=None):
    if not matches:
        return None
    if today is None:
        today = warsaw_today()
    for url in matches:
        rng = parse_filename_range(url)
        if rng and rng[0] <= today <= rng[1]:
            return url
    valid_with_dates = []
    for url in matches:
        rng = parse_filename_range(url)
        if rng:
            valid_with_dates.append((url, rng))
    if valid_with_dates:
        valid_with_dates.sort(key=lambda item: abs((item[1][0] - today).days))
        return valid_with_dates[0][0]
    return matches[0]

def select_upcoming_link(matches, today, current_link=None):
    upcoming = [(rng[0], url) for url in matches
                if url != current_link and (rng := parse_filename_range(url)) and rng[0] > today]
    return min(upcoming)[1] if upcoming else None

def warsaw_today():
    return datetime.datetime.now(ZoneInfo("Europe/Warsaw")).date()

def fetch(url, timeout):
    request = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read()

def save_pdf(pool, page_url, link, destination):
    content = fetch(urljoin(page_url, link), timeout=30)
    if len(content) <= MINIMUM_PDF_BYTES:
        print(f"[{pool.upper()}] {link} is too small ({len(content)} bytes), skipping.")
        return False
    Path(destination).write_bytes(content)
    print(f"[{pool.upper()}] {link} -> {destination} ({len(content)} bytes).")
    return True

def download_pool(pool, page_url, today, directory):
    html = fetch(page_url, timeout=15).decode("utf-8", errors="ignore")
    matches = SCHEDULE_LINK_RE.findall(html)
    if not matches:
        print(f"[{pool.upper()}] No schedule PDF link found on {page_url}. Using existing local file if available.")
        return False

    current_link = select_best_link(matches, today)
    updated = save_pdf(pool, page_url, current_link, directory / PDF_FILES[pool])

    upcoming_destination = directory / UPCOMING_PDF_FILES[pool]
    upcoming_link = select_upcoming_link(matches, today, current_link)
    if upcoming_link:
        save_pdf(pool, page_url, upcoming_link, upcoming_destination)
    elif upcoming_destination.exists():
        upcoming_destination.unlink()
        print(f"[{pool.upper()}] No upcoming schedule published; removed {upcoming_destination}.")
    return updated

def download_schedules(directory="."):
    print("Checking for latest schedule PDFs from sport.gliwice.eu...")
    today = warsaw_today()
    success_count = 0
    for pool, page_url in BASE_URLS.items():
        try:
            success_count += download_pool(pool, page_url, today, Path(directory))
        except Exception as e:
            print(f"[{pool.upper()}] Could not download latest schedule: {e}. Keeping existing files.")
    print(f"Schedule download complete. Updated {success_count}/{len(BASE_URLS)} files.")

if __name__ == "__main__":
    download_schedules()
