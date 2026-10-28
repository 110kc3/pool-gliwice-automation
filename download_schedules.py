#!/usr/bin/env python3
"""
Downloads the latest weekly schedule PDFs for all 4 Gliwice swimming pools from sport.gliwice.eu.
Intelligently selects the schedule matching the active calendar week.
If offline or network error occurs, gracefully logs a warning and exits cleanly
so existing committed PDFs can be used.
"""

import datetime
import os
import re
import urllib.request
from urllib.parse import urljoin, unquote

BASE_URLS = {
    "delfin": "https://sport.gliwice.eu/delfin",
    "mewa": "https://sport.gliwice.eu/mewa",
    "olimpijczyk": "https://sport.gliwice.eu/olimpijczyk",
    "neptun": "https://sport.gliwice.eu/neptun"
}

TARGET_FILES = {
    "delfin": "delfin.pdf",
    "mewa": "mewa.pdf",
    "olimpijczyk": "Harmonogram_Olimpijczyk_latest.pdf",
    "neptun": "neptun.pdf"
}

HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}

def parse_filename_range(url):
    raw = unquote(url)
    m = re.search(r"(\d{1,2})[._](\d{1,2})[._](\d{4})\s*[-_]+\s*(\d{1,2})[._](\d{1,2})[._](\d{4})", raw)
    if m:
        d1, m1, y1, d2, m2, y2 = map(int, m.groups())
        return datetime.date(y1, m1, d1), datetime.date(y2, m2, d2)
    m2 = re.search(r"(\d{1,2})[._](\d{1,2})\s*[-_]+\s*(\d{1,2})[._](\d{1,2})[._](\d{4})", raw)
    if m2:
        d1, m1, d2, m2_m, y2 = map(int, m2.groups())
        return datetime.date(y2, m1, d1), datetime.date(y2, m2_m, d2)
    return None

def select_best_link(matches, today=None):
    if not matches:
        return None
    if today is None:
        today = datetime.date.today()
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

def download_schedules():
    print("Checking for latest schedule PDFs from sport.gliwice.eu...")
    success_count = 0
    today = datetime.date.today()

    for pool, page_url in BASE_URLS.items():
        try:
            req = urllib.request.Request(page_url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=15) as resp:
                html = resp.read().decode("utf-8", errors="ignore")

            # Look for links to Harmonogram*.pdf
            matches = re.findall(r"href=[\"\x27]([^\x27\"]*Harmonogram[^\x27\"]*\.pdf)[\"\x27]", html, re.IGNORECASE)
            if not matches:
                print(f"[{pool.upper()}] No schedule PDF link found on {page_url}. Using existing local file if available.")
                continue

            chosen_path = select_best_link(matches, today)
            pdf_url = urljoin(page_url, chosen_path)
            dest_file = TARGET_FILES[pool]
            print(f"[{pool.upper()}] Selected {chosen_path} -> {dest_file}")

            pdf_req = urllib.request.Request(pdf_url, headers=HEADERS)
            with urllib.request.urlopen(pdf_req, timeout=30) as pdf_resp:
                content = pdf_resp.read()
                if len(content) > 1000:
                    with open(dest_file, "wb") as f:
                        f.write(content)
                    print(f"[{pool.upper()}] Successfully updated {dest_file} ({len(content)} bytes).")
                    success_count += 1
                else:
                    print(f"[{pool.upper()}] Downloaded file is too small ({len(content)} bytes), skipping.")

        except Exception as e:
            print(f"[{pool.upper()}] Could not download latest schedule: {e}. Keeping existing file.")

    print(f"Schedule download complete. Updated {success_count}/{len(BASE_URLS)} files.")

if __name__ == "__main__":
    download_schedules()
