# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## General Development Guidelines

**Core Pattern:** The application follows a strict separation of concerns:
1.  **Data Source:** Raw data is provided in multiple JSON files (`mewa_data.json`, `delfin_data.json`, `olimpijczyk_data.json`).
2.  **Backend Processing (Python):** `master_aggregator.py` orchestrates the entire process. It reads raw data, standardizes field names, and outputs a single, predictable `data.json` file.
3.  **Frontend Consumption (JavaScript):** `script.js` consumes the final `data.json` file.

## ⚙️ Development Commands & Workflow

*   **Build/Test**: Run `pytest tests/test_master_aggregator.py` (backend data transformation) **and** `node tests/test_availability.mjs` (frontend availability scoring/validation) before any large changes.
*   **Run Full Pipeline**: The standard workflow for development is:
    1.  Ensure all raw JSON data files are present and up-to-date.
    2.  Execute `python master_aggregator.py`.
    3.  Run the test suites above.
    4.  If successful, the resulting `data.json` should be consumed by the frontend.

## 📐 High-Level Architecture
The system is a classic three-tier structure:
*   **Data Layer**: JSON files at the root directory.
*   **Business Logic Layer**: Handled by Python scripts (`master_aggregator.py` and `parse_*.py`) which process and normalize the data.
*   **Presentation Layer**: Handled by the static frontend (`index.html`, `style.css`, `script.js`).

## 🐛 Known Weaknesses & Fixes (Post-Bug-Fix Sprint)
*   **Data Contract Enforcement**: The critical point is the schema of `data.json`. Any change to the expected structure (e.g., renaming `availableLanes`) **must** be mirrored on the frontend, or the frontend will break silently.
*   **CI/CD**: The CI workflow installs pinned dependencies via `pip install -r requirements.txt` inside a venv on Python 3.12, sets up Java (required by `tabula-py`), and runs both the Python (`pytest`) and frontend (`node tests/test_availability.mjs`) suites before parsing, aggregating, and deploying.

**Pro Tip**: When debugging data flow, start by checking `data.json` immediately after running `master_aggregator.py`.
EOF
---
name: Project Architecture Guide
description: Provides high-level guidance on the data flow, architecture, and expected file interactions for new developers.
type: project