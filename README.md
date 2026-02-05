# KAVACH — Risk Intelligence Platform

KAVACH is a local, end‑to‑end demo for fintech fraud analysis and company verification. It supports two primary experiences:

1. **Shield** — transaction fraud analytics, risk scoring, dashboards, and AI analyst (optional).
2. **Verify** — a CA‑style company verification module that ingests financial spreadsheets, detects anomalies, and generates reports.

The project is designed as a clean academic‑grade demo with premium UI/UX.

---

## Features

**Shield (Fraud Analytics)**
- Upload Excel/CSV transactions.
- ML‑assisted risk scoring + rule‑based flags.
- KPI dashboard, charts, anomaly tables, AI analyst panel.

**Verify (Company CA Module)**
- Upload company financials (Excel/CSV).
- Flexible parsing of messy spreadsheets.
- Anomaly detection + rule checks.
- Summary metrics + downloadable Excel/PDF reports.

**UI/UX**
- Premium landing page.
- Multi‑theme support (Aurora Core default, Sweet Dark, Dreamy, Solar Copper).
- Glassmorphism dashboard, charts, animations.

---

## Requirements

- Python 3.10+
- Dependencies in `requirements.txt`

Install:
```bash
pip install -r requirements.txt
```

---

## Run the App

```bash
python3 app.py
```

Then open:
- Shield (dashboard): `http://127.0.0.1:8000/dashboard`
- Verify (CA module): `http://127.0.0.1:8000/company_accountant`
- Landing page: `http://127.0.0.1:8000/`

---

## Data Formats

### Shield (Fraud Analytics)
Required columns:
```
user_id, amount, category, merchant, country, timestamp
```

### Verify (Company CA Module)
Accepts **any** Excel/CSV. The parser infers:
- Date column
- Amount column
- Category column

If nothing is detected, it still generates a report with safe defaults.

---

## API Routes

**Shield**
- `POST /upload` — upload transactions
- `GET /dashboard_data` — dashboard JSON
- `POST /ask_ai` — optional AI analyst

**Verify**
- `POST /company_upload` — upload company file
- `GET /company_report` — JSON report
- `GET /company_report_excel` — Excel report
- `GET /company_report_pdf` — PDF report

---

## Themes

Theme selection is stored in `localStorage` under `kavach_theme` and is synced across landing, Shield, and Verify.

Available themes:
- **Aurora Core** (default)
- **Sweet Dark**
- **Dreamy**
- **Solar Copper**

---

## Notes

- The AI analyst uses OpenRouter (optional).
- The Verify module does **not** use AI text generation.
- `python` may not be available; use `python3`.

---

## Troubleshooting

**Upload errors**
- Ensure files are `.xlsx`, `.xls`, or `.csv`.
- Verify should accept messy spreadsheets; it auto‑infers columns.

**No charts in Verify**
- Charts require `matplotlib` and `fpdf2` (already in requirements).

**404 on new routes**
- Restart the server (reload is disabled).

---

## License

Academic / demo use.
