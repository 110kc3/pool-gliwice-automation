# Gliwice pool schedules & Smart Lane Suggester

Daily-refreshed availability and intelligent free-lane suggester for the four Gliwice municipal swimming pools — **Delfin**, **Mewa**, **Olimpijczyk**, and **Neptun** — scraped from the PDF timetables published by the municipal operators and rendered as a simple, modern, comparable view.

**Live application: https://110kc3.github.io/pool-gliwice-automation/**

The municipal pools publish incompatible PDFs on their own schedules, and none of them answered the most important question for swimmers: *"When are the most lanes free right now or this weekend?"* Providing that answer through an automated pipeline and an intuitive recommendation UI is the goal of this repository.

## Features

- 🎯 **Smart Lane Suggester ("Sugester wolnych torów"):**
  - Instant ranking of time slots based on the maximum number of free lanes and openness percentage across all 4 pools.
  - **Spotlight #1 Top Pick:** Prominently highlights the best available slot matching chosen filters.
  - **Contiguous multi-hour sessions:** Support for 1h, 2h, and 3h continuous swimming sessions with minimum free lanes verified across every minute (including quarter-hour source rows) and step-by-step lane progression (`14:00 (6 torów) ➔ 15:00 (5 torów)`).
  - **Calendar Export (.ics / Google Calendar):** One-click button on recommendation cards to add sessions to Google Calendar or download `.ics` files with alarm reminders.
  - **Concrete calendar dates:** Each pool keeps the dates from its own PDF. Missing dates remain unknown; expired timetables remain readable but are excluded from recommendations. Today, tomorrow, and calendar exports use Europe/Warsaw.
  - **Quick interactive filters:** Day (including dynamic "Dziś", "Jutro", "Weekend", "Dni robocze"), Swimming Duration (1h, 2h, 3h), Time of Day (Morning, Afternoon, Evening), Pool preference, and sorting criteria.
  - **Current availability:** The live panel reads the current source interval and finds the next confirmed full-hour visit. It distinguishes unavailable lanes from missing or expired information.
  - **Pool configurations:** Olimpijczyk's day-column configuration supports both ten 50m lanes and twenty 25m lanes; `17x25m` remains 17/20 (85%).
- 📊 **Hourly Matrix Comparison ("Porównanie godzinowe"):**
  - Side-by-side timetable comparing availability across all 4 pools hour-by-hour (06:00 – 22:00) for any selected day and duration (1h, 2h, 3h).
- 📋 **Full Timetables ("Pełne harmonogramy"):**
  - Per-pool schedules with instant real-time text search and day filters.
- 💰 **Pricing & Sports Cards ("Cennik biletów i Karty sportowe"):**
  - Ticket prices (Normalny, Ulgowy, OPEN, dopłata minutowa) and benefit card rules (MultiSport 60 min, Medicover Sport, PZU Sport, FitProfit).
- 📱 **Progressive Web App (PWA):**
  - Installable mobile/desktop app. The service worker refreshes application assets and data online, falling back to cached copies offline. Cached schedule dates are still checked before recommending visits.
- ℹ️ **Pool Technical Specs ("O pływalniach"):**
  - Dimensions (50m Olympic 10-lane basin vs 25m 6-lane sports basins), addresses, water temperatures, and Google Maps directions links.

## How it works

```
delfin.pdf ───┐
mewa.pdf ─────┼─► parse_*.py ─► <pool>_data.json ─► master_aggregator.py ─► data.json ─► index.html
Harmonogram_Olimpijczyk_*.pdf ─┤
neptun.pdf ───┘
```

- **`download_schedules.py`** — automatically queries `sport.gliwice.eu` every night, discovers newly published weekly schedule PDFs for all 4 pools, and downloads the active week's PDF.
- **`parse_delfin.py` / `parse_mewa.py` / `parse_olimpijczyk.py` / `parse_neptun.py`** — one parser per pool, adapting to each PDF layout. Shared helpers in `pdf_utils.py`. Parsers prefer the downloader's canonical PDF over archived files, regardless of checkout modification times. All parsers enforce valid time regex patterns, process multi-table pages, filter noise rows/letters at the source, and replace NaN with valid JSON null.
- **`schedule_metadata.py`** — reads numeric and Polish calendar dates and day-column pool configurations from each canonical source PDF using `pypdf`. Unknown or conflicting dates are not replaced with the build week. An open-ended title alone confirms only its first partial week; a dated holiday column can identify the applicable week.
- **`master_aggregator.py`** — attaches each pool's own dates and configurations, merges per-pool JSON files into `data.json`, standardizes keys, strips carriage returns, and enforces strict standards-compliant JSON (`allow_nan=False`).
- **`index.html` + `script.js` + `style.css`** — modern, responsive, mobile-first static web app with pure JavaScript recommendation and aggregation engine.
- **`.github/workflows/weekly_update.yml`** — runs every night at 02:00 UTC: sets up Python 3.12, Java 17, and Node 20, downloads latest PDFs, runs all 4 parsers and aggregator, executes all Python and JavaScript suites, validates data integrity, and deploys to GitHub Pages.

**`.github/workflows/ci.yml`** runs regression tests on code pushes and pull requests without deploying. Publication remains on the existing daily schedule or an explicit workflow dispatch.

## Running locally

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python download_schedules.py         # downloads latest PDFs from sport.gliwice.eu
python parse_delfin.py && python parse_mewa.py && python parse_olimpijczyk.py && python parse_neptun.py
python master_aggregator.py          # writes data.json
python -m http.server 8080           # then open http://localhost:8080
```

## Running tests

```bash
# Backend transformations, source dates, and configurations (27 tests)
python -m pytest tests -q

# Frontend availability, dates, live status, and service worker (41 tests)
node tests/test_availability.mjs
node --test --test-reporter=dot tests/test_schedule_regressions.mjs tests/test_service_worker.mjs
```

All suites run automatically in CI before any deployment to GitHub Pages.

## Documentation

| File | What it covers |
|---|---|
| [PROJECT_PROGRESS_SUMMARY.md](PROJECT_PROGRESS_SUMMARY.md) | Comprehensive implementation summary of bug fixes, features, and verification |
| [BUG_REPORT.md](BUG_REPORT.md) | Original architectural review and weakness analysis |
| [CLAUDE.md](CLAUDE.md) | Architecture conventions and testing guidelines for developers |
