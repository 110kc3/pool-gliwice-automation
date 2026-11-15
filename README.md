# Gliwice Pool Schedules & Smart Lane Suggester

Automated scraping pipeline and PWA free-lane recommender for the four municipal swimming pools in Gliwice, Poland (**Delfin**, **Mewa**, **Olimpijczyk**, **Neptun**).

Live Application: https://110kc3.github.io/pool-gliwice-automation/

## Highlights

- **Smart Lane Suggester:** Instant ranking of swim time slots by free lane count, continuous multi-hour duration checks (1h, 2h, 3h), and calendar exports (`.ics` / Google Calendar)
- **Automated PDF Ingestion:** Scrapes and parses disparate municipal timetable PDFs using customized layout extractors
- **Hourly Cross-Pool Matrix:** Interactive side-by-side comparison across all four venues (06:00 – 22:00)
- **Installable PWA:** Offline-capable Progressive Web App with service worker caching and Warsaw-timezone date awareness
- **Pricing & Facility Specs:** Accurate admission pricing, benefit sports card rules (MultiSport, Medicover), pool dimensions, and water temperatures

Each pool keeps the dates printed in its own PDF. When the operator has already published the following week, it is fetched as `<pool>_next.pdf` and appended to that pool, so Sunday visitors can plan Monday. The page shows a rolling seven days from today, lists eight recommendations at a time, and merges identical quarter-hours in the source timetables into time ranges. Missing dates stay unknown, and expired timetables remain readable but are excluded from recommendations.

## Quick Start

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python download_schedules.py
python parse_delfin.py && python parse_mewa.py && python parse_olimpijczyk.py && python parse_neptun.py
python master_aggregator.py
python -m http.server 8080
```

Run test suite:

```bash
python -m pytest tests -q
node tests/test_availability.mjs
node --test --test-reporter=dot tests/test_schedule_regressions.mjs tests/test_service_worker.mjs
```

## Documentation

- [Project Progress Summary](PROJECT_PROGRESS_SUMMARY.md)
- [Original architectural review](BUG_REPORT.md)
