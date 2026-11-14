# Gliwice Pool Schedules & Smart Lane Suggester

Automated scraping pipeline and PWA free-lane recommender for the four municipal swimming pools in Gliwice, Poland (**Delfin**, **Mewa**, **Olimpijczyk**, **Neptun**).

Live Application: https://110kc3.github.io/pool-gliwice-automation/

## Highlights

- **Smart Lane Suggester:** Instant ranking of swim time slots by free lane count, continuous multi-hour duration checks (1h, 2h, 3h), and calendar exports (`.ics` / Google Calendar)
- **Automated PDF Ingestion:** Scrapes and parses disparate municipal timetable PDFs using customized layout extractors
- **Hourly Cross-Pool Matrix:** Interactive side-by-side comparison across all four venues (06:00 – 22:00)
- **Installable PWA:** Offline-capable Progressive Web App with service worker caching and Warsaw-timezone date awareness
- **Pricing & Facility Specs:** Accurate admission pricing, benefit sports card rules (MultiSport, Medicover), pool dimensions, and water temperatures

## Quick Start

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python download_schedules.py
python master_aggregator.py
```

Run test suite:

```bash
pytest -q tests
node --test tests/test_availability.mjs
```

## Documentation

- [Project Progress Summary](PROJECT_PROGRESS_SUMMARY.md)
- [Bug Reporting & Known Limits](BUG_REPORT.md)
