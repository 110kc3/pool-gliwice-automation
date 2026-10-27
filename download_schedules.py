#!/usr/bin/env python3
"""
Downloads the latest weekly schedule PDFs for all 4 Gliwice swimming pools from sport.gliwice.eu.
If offline or network error occurs, gracefully logs a warning and exits cleanly
so existing committed PDFs can be used.
"""

import os
import re
import urllib.request
from urllib.parse import urljoin

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

def download_schedules():
    print("Checking for latest schedule PDFs from sport.gliwice.eu...")
    success_count = 0

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

            pdf_url = urljoin(page_url, matches[0])
            dest_file = TARGET_FILES[pool]
            print(f"[{pool.upper()}] Downloading {pdf_url} -> {dest_file}")

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
