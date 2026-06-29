# Bug Report Implementation Summary

**Overall Status:** The system has successfully addressed the major architectural weaknesses identified in the initial bug report.

**Completed Tasks:**
1.  **Data Pipeline Error Handling (Task 1):** Enhanced `master_aggregator.py` to use specific JSON/file exceptions, preventing broad exception swallowing.
2.  **Unit Testing (Task 2):** Added comprehensive unit tests to `tests/test_master_aggregator.py`, specifically covering data integrity checks like skipping non-dictionary elements and handling missing time fields.
3.  **CI/CD Refactoring (Task 3):** Updated `.github/workflows/weekly_update.yml` and `requirements.txt` to remove brittle system calls (`sudo apt-get`) and enforce dependency management using Python's virtual environment (`venv`), ensuring a reproducible build environment.
4.  **Task 4 — Frontend Schema Validation (DONE, 2026-06-14):** `script.js` now validates `data.json` on load via `validatePoolData()`: it rejects non-array payloads, drops malformed pool records / entries (logging a warning count), guards against non-string fields before use, and renders a visible error state instead of failing silently. `fetch` now checks `response.ok`. (Closes BUG_REPORT.md §4.)
5.  **Availability scoring correctness (DONE, 2026-06-14):** Replaced the brittle `parseAvailability` heuristic. The previous "best slot" ranking compared incompatible scales — Mewa/Delfin emit only `Pływalnia dostępna`/`niedostępna` (mapped 5/0) while Olimpijczyk emits lane counts (parsed up to 9–10), so Olimpijczyk almost always "won" purely due to bigger numbers. New `classifyAvailability()` parses every real format (`Nx50m` lane counts, `Zajęty N tory` occupancy, `dostępna-zajęty N`, `wolne wszystkie tory`, closed/unavailable) into a structured descriptor, and `opennessScore()` normalises everything to a per-pool 0–1 "openness" scale (capacity computed per pool, floored at 10 lanes). Highlights now show "% wolne" instead of an opaque `Score`. Covered by `tests/test_availability.mjs` (10 tests; run `node tests/test_availability.mjs`).

**Outstanding / Pending Work:**

*   **Python unit tests:** `pytest tests/test_master_aggregator.py` — all 5 pass as of 2026-06-14. (The previously reported 2-failure regression no longer reproduces; code and tests are reconciled — non-dict entries are guarded in `transform_data()` and NaN lanes are skipped.)

*   **Data noise at the source (Pending):** Header/date/day-name rows and stray-letter artifacts still leak into `data.json` (e.g. `Ilość wolnych torów`, `5 kwietnia`, `n`). The frontend now filters these out via `classifyAvailability().noise`, but the pipeline (`master_aggregator.py` / `parse_*.py`) should drop them so `data.json` is clean at rest. Note: `olimpijczyk_data.json` and `all_pools_data.json` contain bare `NaN`, which is invalid JSON — parsers should emit `null`.

*   **CI does not run the tests (Pending):** `weekly_update.yml` parses → aggregates → deploys with no `pytest` (or `node`) step; the suites only run manually.

*   **Dependency / CI hygiene (Pending):** `requirements.txt` pins no versions (`tabula-py`, `pandas`, `numpy`). The CI workflow targets Python 3.9 (end-of-life since Oct 2025) and uses outdated actions (`checkout@v3`, `setup-python@v4`, `peaceiris@v3`). CLAUDE.md's claim of "the latest version of Python 3.9" is also stale.