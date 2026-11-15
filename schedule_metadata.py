"""Dates and pool configurations from the same PDF used by each parser.

Unknown dates stay unknown: neither the build date nor another pool's timetable
is evidence that a schedule applies this week.
"""
import datetime as dt
import re
from pathlib import Path

from pypdf import PdfReader

DAYS = ["Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek", "Sobota", "Niedziela"]
PDF_FILES = {
    "mewa": "mewa.pdf", "delfin": "delfin.pdf",
    "olimpijczyk": "Harmonogram_Olimpijczyk_latest.pdf", "neptun": "neptun.pdf",
}
UPCOMING_PDF_FILES = {name: f"{name}_next.pdf" for name in PDF_FILES}
MONTHS = {name: i + 1 for i, name in enumerate([
    "stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca",
    "lipca", "sierpnia", "września", "października", "listopada", "grudnia",
])}
MONTH_PATTERN = "(?:" + "|".join(MONTHS) + ")"

def week_dates(anchor, valid_from=None):
    monday = anchor - dt.timedelta(days=anchor.weekday())
    return {day: date.strftime("%d.%m.%Y") for i, day in enumerate(DAYS)
            if (date := monday + dt.timedelta(days=i)) >= (valid_from or monday)}

def schedule_validity(text):
    text = re.sub(r"\s+", " ", text.lower())
    try:
        numeric = [dt.date(2000 + int(y) if len(y) == 2 else int(y), int(m), int(d))
                   for d, m, y in re.findall(r"\b(\d{1,2})[./](\d{1,2})[./](\d{4}|\d{2})\b", text)]
        if numeric:
            mondays = {date - dt.timedelta(days=date.weekday()) for date in numeric}
            if len(mondays) == 1:
                monday = mondays.pop()
                return monday, monday + dt.timedelta(days=6)
            return None

        pattern = (rf"\b(\d{{1,2}})(?:\s+({MONTH_PATTERN}))?(?:\s+(\d{{4}}))?"
                   rf"\s*(?:do|[-–—])\s*(\d{{1,2}})\s+({MONTH_PATTERN})\s+(\d{{4}})")
        ranges = re.findall(pattern, text)
        for d1, m1, y1, d2, m2, y2 in ranges:
            end = dt.date(int(y2), MONTHS[m2], int(d2))
            start_month = MONTHS[m1 or m2]
            start_year = int(y1) if y1 else end.year - (start_month > end.month)
            start = dt.date(start_year, start_month, int(d1))
            if (end - start).days == 6 and start.weekday() == 0:
                return start, end
        if ranges:
            return None

        match = re.search(rf"\bod\s+(\d{{1,2}})\s+({MONTH_PATTERN})\s+(\d{{4}})", text)
        if match:
            d, m, y = match.groups()
            return dt.date(int(y), MONTHS[m], int(d)), None
    except ValueError:
        pass
    return None

def dates_from_text(text):
    validity = schedule_validity(text)
    return week_dates(validity[0], valid_from=validity[0]) if validity else {}

def open_ended_start_from_text(text):
    validity = schedule_validity(text)
    return validity[0] if validity and validity[1] is None else None

def first_page_text(pdf_path):
    return PdfReader(pdf_path).pages[0].extract_text(extraction_mode="layout")

def open_ended_start(pdf_path):
    try:
        return open_ended_start_from_text(first_page_text(pdf_path))
    except Exception:
        return None

def configurations_from_text(text):
    """Read Olimpijczyk's seven day-column configurations in layout order."""
    for line in text.splitlines():
        values = re.findall(r"(?:2\s*x\s*)?(?:25(?:\s*/\s*50)?|50)\s*metr[óo]w", line.lower())
        if len(values) == 7:
            return dict(zip(DAYS, values))
    return {}

def read_metadata(pdf_path):
    try:
        text = first_page_text(pdf_path)
        return dates_from_text(text), configurations_from_text(text)
    except Exception as exc:
        print(f"Warning: Cannot determine schedule metadata from {pdf_path}: {exc}")
        return {}, {}

def source_pdf(pool_name, directory="."):
    """Use the downloader's canonical file, never archived files' checkout mtimes."""
    return Path(directory) / PDF_FILES[pool_name.lower()]

def upcoming_pdf(pool_name, directory="."):
    return Path(directory) / UPCOMING_PDF_FILES[pool_name.lower()]

def lane_configuration(raw, configuration):
    has_50m = bool(re.search(r"\d+\s*x\s*50\s*m", raw, re.I))
    has_25m = bool(re.search(r"\d+\s*x\s*25\s*m", raw, re.I))
    split = "2" in configuration and "25" in configuration and not has_50m
    return {"totalLanes": 20 if split else 10,
            "laneLength": "25m" if split else ("25m / 50m" if has_25m and has_50m else "50m")}
