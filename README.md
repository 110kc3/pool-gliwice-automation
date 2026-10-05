# Gliwice pool schedules

Weekly-updated availability for the three Gliwice swimming pools — **Delfin**,
**Mewa** and **Olimpijczyk** — scraped from the PDF timetables each pool
publishes and rendered as one comparable view.

**Live: https://110kc3.github.io/pool-gliwice-automation/**

The pools publish incompatible PDFs on their own schedules, and none of them
says "which pool is actually free right now". That comparison is the whole
point of this repo.

## How it works

```
delfin.pdf ─┐
mewa.pdf ───┼─► parse_*.py ─► <pool>_data.json ─► master_aggregator.py ─► data.json ─► index.html
Harmonogram_Olimpijczyk_*.pdf ─┘
```

- **`parse_delfin.py` / `parse_mewa.py` / `parse_olimpijczyk.py`** — one parser
  per pool, because each publishes a different PDF layout. Shared helpers in
  `pdf_utils.py`.
- **`master_aggregator.py`** — merges the per-pool JSON into `data.json`,
  grouped by pool.
- **`index.html` + `script.js` + `style.css`** — the published page. `script.js`
  validates `data.json` on load (`validatePoolData()`), drops malformed records
  and renders a visible error state rather than failing silently.
- **`.github/workflows/weekly_update.yml`** — Mondays 00:00 UTC: parse,
  aggregate, deploy to Pages.

### The comparison is not as simple as it looks

The pools report availability on genuinely different scales: Mewa and Delfin
emit only `Pływalnia dostępna` / `niedostępna`, while Olimpijczyk emits lane
counts. Ranking them on raw numbers made Olimpijczyk "win" almost every slot
purely because its numbers were bigger.

`classifyAvailability()` parses every real format into a structured descriptor
and `opennessScore()` normalises them to a per-pool 0–1 scale, so the page shows
**"% wolne"** rather than an opaque score. Covered by
`tests/test_availability.mjs`.

## Running locally

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python parse_delfin.py && python parse_mewa.py && python parse_olimpijczyk.py
python master_aggregator.py          # writes data.json
python -m http.server                # then open index.html
```

## Tests

```bash
pytest tests/test_master_aggregator.py -q     # aggregation + data integrity
node tests/test_availability.mjs              # availability scoring (10 tests)
```

> **CI does not run either suite** — `weekly_update.yml` parses, aggregates and
> deploys with no test step, so both only run by hand. See
> `PROJECT_PROGRESS_SUMMARY.md`, which tracks this and the remaining data-noise
> work (header/date rows leaking into `data.json`, and bare `NaN` in
> `olimpijczyk_data.json` / `all_pools_data.json`, which is invalid JSON).

## Documentation

| File | What it covers |
|---|---|
| [PROJECT_PROGRESS_SUMMARY.md](PROJECT_PROGRESS_SUMMARY.md) | What has been fixed, and what is still outstanding |
| [BUG_REPORT.md](BUG_REPORT.md) | The original review this project worked through |
| [CLAUDE.md](CLAUDE.md) | Conventions for agents working in this repo |
