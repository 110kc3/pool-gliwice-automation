# Gliwice pool schedules & Smart Lane Suggester

Weekly-updated availability and intelligent free-lane suggester for the four Gliwice municipal swimming pools — **Delfin**, **Mewa**, **Olimpijczyk**, and **Neptun** — scraped from the PDF timetables published by the municipal operators and rendered as a simple, modern, comparable view.

**Live application: https://110kc3.github.io/pool-gliwice-automation/**

The municipal pools publish incompatible PDFs on their own schedules, and none of them answered the most important question for swimmers: *"When are the most lanes free right now or this weekend?"* Providing that answer through an automated pipeline and an intuitive recommendation UI is the goal of this repository.

## Features

- 🎯 **Smart Lane Suggester ("Sugester wolnych torów"):**
  - Instant ranking of time slots based on the maximum number of free lanes and openness percentage across all 4 pools.
  - **Spotlight #1 Top Pick:** Prominently highlights the best available slot matching chosen filters.
  - **Quick interactive filters:** Day (including dynamic "Dziś", "Jutro", "Weekend", "Dni robocze"), Time of Day (Morning, Afternoon, Evening), Pool preference, and sorting criteria.
  - **Data-driven takeaways:** Key statistical insights computed dynamically across all schedules (e.g. Sunday 84% average free capacity, evenings after 17:00 with 87% free lanes, Olimpijczyk 10-lane peak capacity at 06:00).
- 📊 **Hourly Matrix Comparison ("Porównanie godzinowe"):**
  - Side-by-side timetable comparing availability across all 4 pools hour-by-hour (06:00 – 22:00) for any selected day.
- 📋 **Full Timetables ("Pełne harmonogramy"):**
  - Per-pool schedules with instant real-time text search and day filters.
- ℹ️ **Pool Technical Specs ("O pływalniach"):**
  - Dimensions (50m Olympic 10-lane basin vs 25m 6-lane sports basins), addresses, water temperatures, and Google Maps directions links.

## How it works

```
delfin.pdf ───┐
mewa.pdf ─────┼─► parse_*.py ─► <pool>_data.json ─► master_aggregator.py ─► data.json ─► index.html
Harmonogram_Olimpijczyk_*.pdf ─┤
neptun.pdf ───┘
```

- **`parse_delfin.py` / `parse_mewa.py` / `parse_olimpijczyk.py` / `parse_neptun.py`** — one parser per pool, adapting to each PDF layout. Shared helpers in `pdf_utils.py`. All parsers enforce valid time regex patterns, process multi-table pages, filter noise rows/letters at the source, and replace NaN with valid JSON null.
- **`master_aggregator.py`** — merges per-pool JSON files into `data.json`, standardizes keys, strips carriage returns, and enforces strict standards-compliant JSON (`allow_nan=False`).
- **`index.html` + `script.js` + `style.css`** — modern, responsive, mobile-first static web app with pure JavaScript recommendation and aggregation engine.
- **`.github/workflows/weekly_update.yml`** — runs every Monday at 00:00 UTC: sets up Python 3.12, Java 17, and Node 20, runs unit test suites (`pytest` and `node tests/test_availability.mjs`), executes all 4 parsers and aggregator, and deploys to GitHub Pages.

## Running locally

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python parse_delfin.py && python parse_mewa.py && python parse_olimpijczyk.py && python parse_neptun.py
python master_aggregator.py          # writes data.json
python -m http.server 8080           # then open http://localhost:8080
```

## Running tests

```bash
# Backend data transformation & noise filtering tests (12 tests)
pytest tests/test_master_aggregator.py -q

# Frontend availability scoring, lane calculations & suggester engine (16 tests)
node tests/test_availability.mjs
```

Both test suites run automatically in CI before any deployment to GitHub Pages.

## Documentation

| File | What it covers |
|---|---|
| [PROJECT_PROGRESS_SUMMARY.md](PROJECT_PROGRESS_SUMMARY.md) | Comprehensive implementation summary of bug fixes, features, and verification |
| [BUG_REPORT.md](BUG_REPORT.md) | Original architectural review and weakness analysis |
| [CLAUDE.md](CLAUDE.md) | Architecture conventions and testing guidelines for developers |
