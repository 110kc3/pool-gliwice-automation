# Project Implementation & Review Summary

## Current work — 2026-11-15

Accepted scope: find out why no new schedules appeared, trim the amount of text on the page, push.

1. Cause: the downloader fetched only the PDF covering today, so next week's timetables (already published for Olimpijczyk and Neptun on 15 November) were ignored until Monday's run, and the 02:00 UTC cron actually started around 08:45–09:25 UTC. Every Monday morning the page had only expired data.
2. Second cause, found on the 16–22 November Olimpijczyk PDF: its title reads `16 - 22 listopada 2026` without `od`, which the date parser rejected. That week would have been published without dates and excluded from recommendations.
3. Fix: upcoming-week PDFs are downloaded, parsed and appended per pool; week titles without `od` are accepted; the workflow runs at 03:17 and 15:17 UTC and stages deleted upcoming files.
4. Page text: rolling seven-day pills from today, eight results per page with "Pokaż więcej", source timetables merged from about 2,300 quarter-hour rows to about 320 ranges, matrix cells reduced to `free / total`, freshness banner shown only for pools without a current timetable, shorter labels, and the info tab without descriptive paragraphs. Rendered text on the default tab went from 3,952 to 2,177 characters, across all tabs from 8,151 to 4,208.
5. Owner decision later on 15 November: an open-ended timetable (Delfin's `od 12 listopada 2026`) is now a standing schedule, repeated through the current and following week until a replacement is published. Timetables with an end date or printed dates are still never repeated. Mewa shows "brak nowego harmonogramu" until the operator publishes a new PDF.
6. Neptun parser: a merged holiday cell removed one cell per row, so every later day was read one column to the left (Sunday's values landed on Saturday, Sunday was empty), and the 14:00 row was dropped every week because its time cell sits on the previous page row. Cells are now placed by x-position.
7. Not done: the 9–15 November Olimpijczyk PDF has four rows with the same missing-cell pattern; that parser still reads columns by position.

Verification: 38 Python tests and 45 JavaScript tests pass; the full pipeline ran against the live site on 15 November; the page was rendered in headless Chromium at 390px and 1440px.

## Previous work — 2026-11-13

Accepted scope: fix the six findings from the 2026-11-12 review and push the completed changes.

1. Per-pool dates now come from the same canonical PDF as availability. No build-week or other-pool fallback; unknown/expired data is labelled and excluded from recommendations.
2. Hourly and multi-hour visits require complete interval coverage. Lane counts and openness describe the minimum throughout the visit; closures, gaps, and unknown cells cannot be averaged away.
3. Today/tomorrow use full calendar dates in Europe/Warsaw, including Sunday rollover. Windows cannot combine different weeks. Calendar exports require confirmed dates.
4. The service worker refreshes cached assets and schedules online, preserves offline fallback, and removes only obsolete pool caches.
5. The live panel uses current source intervals, with no fixed night cutoff or invented opening time. Before dawn it finds the next visit on the actual applicable date.
6. Olimpijczyk configurations are read per day; split 25m sessions use 20-lane capacity, preserving 17/20 instead of clamping to 10/10.

Verification: 27 Python tests and 41 JavaScript tests pass. All four parsers and the aggregator were run against the committed PDFs. Chromium checks passed at 390px and 1440px, including Warsaw dates with a US browser timezone, filters, matrix, source timetables, and real online cache refresh/offline reload.

Source snapshot: PDFs at `13315ca` have Mewa dated 2–8 November and the other pools dated 9–15 November. Regenerated `data.json` preserves that distinction. Missing quarter-hour cells remain unknown rather than being forward-filled.

Next accepted implementation task: none. Push verification is pending for the commit containing this section; check its [Actions run](https://github.com/110kc3/pool-gliwice-automation/actions?query=branch%3Amaster) once at the next session. The scheduled publication workflow remains unchanged in its triggers; the new push/PR workflow runs tests only.

## Historical implementation notes

The notes below describe the October implementation, not additional accepted work or a claim that every possible weakness has been resolved.

---

## 🏊 Municipal Pools Covered (4 Objects in Gliwice)
1. **Kryta Pływalnia „Olimpijczyk”** (ul. Oriona 120, Łabędy) — 50m basen olimpijski (10 torów), trybuny na 800 osób.
2. **Kryta Pływalnia „Mewa”** (ul. Mewy 36, Sośnica) — 25m basen sportowy (6 torów), basen rekreacyjny, sauna.
3. **Kryta Pływalnia „Delfin”** (ul. Warszawska 35, Śródmieście) — 25m basen sportowy (6 torów), mały basen.
4. **Kryta Pływalnia „Neptun”** (ul. Dzionkarzy 29, Sośnica) — 25m basen sportowy (6 torów, do 5 wolnych), niecka rekreacyjna, zespół saun.

---

## 🔍 Investigation: Why was Olimpijczyk poorly available?
A thorough deep dive revealed two root causes that severely suppressed Olimpijczyk's availability in previous versions:
1. **Parser truncation bug (`parse_olimpijczyk.py`):**
   * Tabula splits the multi-page Olimpijczyk PDF into 3 separate tables: Table 0 (06:00–11:30), Table 1 (11:45–18:45), and Table 2 (19:00–22:00).
   * Previously, `parse_olimpijczyk.py` had `df = tables[0]`, entirely dropping Table 1 and Table 2! Over 60% of daily slots (the entire afternoon and evening) were never extracted.
   * **Fix:** `parse_olimpijczyk.py` now iterates through all tables (`for df in tables:`), increasing parsed slots from 23 to 65 slots per day (06:00 to 22:00), expanding schedule records from 115 to 373!
2. **Stale holiday PDF in repo:**
   * The previously committed PDF (`Harmonogram_Olimpijczyk_30_03-05_04_2026.pdf`) was from Easter weekend (April 4–5, 2026), where Saturday and Sunday were marked with vertical text "Pływalnia nieczynna".
   * In standard weeks (such as the latest `Harmonogram_Olimpijczyk_26.10.2026_-_01.11.2026.pdf`), Saturday is open with 8–9 lanes free all afternoon.
   * On weekdays, availability is genuinely constrained between 14:00 and 19:00 due to sports clubs (Sikret Gliwice) and swimming schools.

---

## 🔱 Kryta Pływalnia Neptun Integration
* **New parser `parse_neptun.py`:** Extracts 15-minute intervals from `neptun.pdf` (or `Harmonogram_Neptun_*.pdf`) using lattice grid extraction. Parses both `B. sportowy` (lane counts 0–5) and `B. rekreacyjny` ('wolny', 'zajęty', '1/3 wolna').
* **Aggregator integration:** Added `"neptun": "neptun_data.json"` to `master_aggregator.py`.
* **CI/CD pipeline:** Updated `.github/workflows/weekly_update.yml` to run `parse_neptun.py` during weekly deployments.
* **Frontend support:** Added Neptun to pool filters, hourly comparison matrix (4-column layout), full schedules view, and pool specifications card.

---

## 🎯 Smart Lane Suggester & Modern UI
* **Ranking engine:** Computes availability score based on free lane count and percentage of pool capacity.
* **Spotlight #1 Top Pick:** Prominently highlights the single best available slot matching filters.
* **Interactive Filtering:** Quick pills for Day (dynamic today, tomorrow, weekend, workdays, specific days), Time of Day (morning, afternoon, evening), Pool preference, and sorting criteria.
* **Key Insights Banner:** Real-time data statistics across all 4 pools (best days, peak hours, club rush hours).
* **Hourly Matrix Comparison:** Side-by-side view of all 4 pools hour-by-hour (06:00 to 22:00) for any selected day.
* **Full Timetables & Search:** Real-time text search and filterable schedules for every pool.
* **Responsive Aquatic Design:** Clean typography, color-coded badges, dark-mode support, and mobile-friendly layouts.

---

## 🧪 Test Coverage
* **Python tests:** 12 passed in `tests/test_master_aggregator.py` (data transformations, NaN handling, noise filters).
* **JavaScript tests:** 16 passed in `tests/test_availability.mjs` (availability classification, Neptun formats, lane scoring, time bucketing, ranking).
