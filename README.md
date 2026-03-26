# KAVACH — Risk Intelligence Platform

> **A premium, end-to-end fintech demo application for fraud detection and financial verification**

KAVACH is a production-grade academic demonstration of modern fintech risk intelligence, combining interpretable machine learning with rule-based analytics. It features two integrated modules:

- **🛡️ Shield** — Transaction fraud analytics with ML-assisted risk scoring, interactive dashboards, and an optional AI analyst
- **✓ Verify** — Company financial verification (CA-style module) with anomaly detection, trend analysis, and multi-format report generation

Designed with **premium UI/UX**, modularity, and clean code architecture for educational purposes.

---

## 📋 Table of Contents

- [Quick Start](#quick-start)
- [Features Overview](#features-overview)
- [Project Architecture](#project-architecture)
- [Technology Stack](#technology-stack)
- [Installation & Setup](#installation--setup)
- [Running the Application](#running-the-application)
- [Data Formats & Examples](#data-formats--examples)
- [API Routes & Documentation](#api-routes--documentation)
- [Understanding the ML Pipeline](#understanding-the-ml-pipeline)
- [Project Structure](#project-structure)
- [Frontend Architecture](#frontend-architecture)
- [Configuration & Environment](#configuration--environment)
- [Development Guide](#development-guide)
- [Troubleshooting](#troubleshooting)
- [Known Issues & TODOs](#known-issues--todos)
- [Performance Considerations](#performance-considerations)
- [License](#license)

---

## 🚀 Quick Start

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Run the application
python app.py

# 3. Open in your browser
# Landing page:      http://127.0.0.1:8000/
# Shield dashboard:  http://127.0.0.1:8000/dashboard
# Verify module:     http://127.0.0.1:8000/company_accountant
```

**Requirements:** Python 3.10+

---

## ✨ Features Overview

### 🛡️ Shield — Transaction Fraud Analytics

**Core Capabilities:**
- **Excel/CSV Upload** — Import transaction data with flexible column mapping
- **ML Risk Scoring** — RandomForest classifier trained on historical data
- **Dual Approach** — Combines rule-based flags + model predictions for robust fraud detection
- **Interactive Dashboard** — Real-time KPIs, charts, anomaly detection tables
- **AI Analyst** — Optional OpenRouter integration for natural-language fraud explanations
- **Anomaly Detection** — Z-score based outlier detection (>3 sigma)
- **User Segmentation** — Clustering insights and per-user summaries

**Dashboard Contains:**
- Quick stats bar (last scan, transactions processed, fraud rate, anomalies detected)
- Category spending breakdown (doughnut/bar chart toggle)
- Monthly trend analysis (line chart with seasonal patterns)
- Flagged transactions table (filterable, sortable, paginated)
- User profiles panel with spend summaries
- AI analyst chat interface for explainability
- Multi-level fraud scoring visualization

**Example Input Schema:**
```
user_id, amount, category, merchant, country, timestamp
USER001, 150.50, Groceries, Walmart, India, 2024-01-15 10:30:00
USER002, 5000.00, Travel, Emirates Airlines, UAE, 2024-01-15 11:45:00
USER001, 3500.00, Shopping, Amazon, India, 2024-01-15 12:00:00  ← Anomaly
```

---

### ✓ Verify — Company Financial Verification (CA Module)

**Core Capabilities:**
- **Flexible Parsing** — Auto-detects date, amount, category columns from messy spreadsheets
- **Column Aliases** — Handles variations like "Date"/"Transaction Date", "Amount"/"Value", etc.
- **Anomaly Detection** — Isolation Forest for unsupervised outlier detection
- **Summary Metrics** — Revenue, expenses, net income, key financial ratios
- **Trend Analysis** — Monthly aggregations and year-over-year patterns
- **Category Breakdown** — Expense and revenue distribution
- **Report Generation** —
  - Excel export with formatted tables and embedded charts
  - PDF export with signature verification stamps
  - JSON report for API consumption

**Example Report Output:**
```json
{
  "summary": {
    "total_revenue": 250000.00,
    "total_expenses": 180000.00,
    "net_income": 70000.00,
    "gross_margin_percent": 28.0,
    "expense_ratio_percent": 72.0
  },
  "anomalies": [
    {
      "date": "2024-03-15",
      "category": "Marketing",
      "amount": 45000.00,
      "anomaly_score": 0.92,
      "severity": "HIGH"
    }
  ],
  "monthly_trends": [...],
  "category_totals": {...}
}
```

---

### 🎨 User Interface & Themes

**Design System:**
- **Glassmorphism** aesthetics with backdrop blur effects
- **OKLCH-based color palette** for perceptual uniformity
- **Responsive grid layout** that adapts to mobile, tablet, and desktop
- **Smooth animations** and micro-interactions
- **Accessibility-first** approach (ARIA labels, keyboard navigation)

**Theme Support:**
- **Aurora Core** (default) — Cool blues and purples with glassmorphic depth
- **Sweet Dark** — Dark mode with warm accents
- **Dreamy** — Soft pastels and gradients
- **Solar Copper** — Warm, sunset-inspired palette

Themes are persisted in browser `localStorage` and synced across all pages.

---

## 🏗️ Project Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    FastAPI Application                       │
│                         (app.py)                             │
└──────────────────┬──────────────────────────────────────────┘
                   │
        ┌──────────┼──────────┐
        │          │          │
   ┌────▼─────┐ ┌─▼──────┐ ┌─▼─────────┐
   │  Shield  │ │ Verify │ │ Landing   │
   │ Analytics│ │  (CA)  │ │   Page    │
   └────┬─────┘ └─┬──────┘ └───────────┘
        │         │
   ┌────▼─────────▼──────────────────────┐
   │  Frontend (HTML/JS/CSS)              │
   │  - Landing Page                      │
   │  - Shield Dashboard                  │
   │  - Verify Interface                  │
   └──────────────────────────────────────┘

   ┌────────────────────────────────────────────────────────┐
   │           Data Processing Pipeline                     │
   ├────────────────────────────────────────────────────────┤
   │                                                        │
   │  File Upload              Ingestion                    │
   │  (Excel/CSV)              (Column Mapping)            │
   │      │                       │                         │
   │      └───────────⬇───────────┘                        │
   │           Data Frame                                  │
   │              │                                        │
   │      ┌───────▼────────┐                              │
   │      │ Preprocessing  │                              │
   │      │ (Scaling,      │                              │
   │      │  Encoding)     │                              │
   │      └───────┬────────┘                              │
   │              │                                        │
   │      ┌───────▼──────────┐                            │
   │      │ Feature          │                            │
   │      │ Engineering      │                            │
   │      │ (Transaction     │                            │
   │      │  Features)       │                            │
   │      └───────┬──────────┘                            │
   │              │                                        │
   │      ┌───────▼──────────────┐                        │
   │      │ ML Model Inference   │                        │
   │      │ (RandomForest +      │                        │
   │      │  Rule-based Flags)   │                        │
   │      └───────┬──────────────┘                        │
   │              │                                        │
   │      ┌───────▼──────────┐                            │
   │      │ Insights         │                            │
   │      │ Generation       │                            │
   │      │ (Aggregations,   │                            │
   │      │  Anomalies)      │                            │
   │      └───────┬──────────┘                            │
   │              │                                        │
   │       JSON Report  ◀────────────────┐               │
   │                                     │               │
   │                            Excel/PDF Export         │
   │                                                     │
   └─────────────────────────────────────────────────────┘
```

---

## 🛠️ Technology Stack

### Backend
- **Framework:** FastAPI 0.115.5 + Uvicorn 0.32.0 (async HTTP server)
- **Data Processing:** pandas 2.2.3, numpy 2.1.3
- **ML & Preprocessing:**
  - scikit-learn 1.5.2 (RandomForest, Isolation Forest, StandardScaler, OneHotEncoder)
  - optuna 4.0.0 (hyperparameter tuning)
- **API & Data Validation:** Pydantic 2.9.2
- **Report Generation:**
  - openpyxl 3.1.5 (Excel file creation)
  - fpdf2 2.7.9 (PDF generation)
  - matplotlib 3.9.2 (chart rendering)
- **External APIs:** replicate 0.32.1 + requests 2.32.3 (OpenRouter integration)
- **Configuration:** python-dotenv 1.0.1 (environment variables)

### Frontend
- **Language:** Vanilla JavaScript (no framework)
- **Charting:** Chart.js 4.4.1, Plotly 2.30.0
- **PDF Generation:** jsPDF 2.5.1
- **Design:** Hand-written CSS3 (glassmorphism, animations, responsive grid)
- **Icons:** SVG favicon (no external icon library)

### Python Version
- **Minimum:** Python 3.10
- **Recommended:** Python 3.11+

---

## 📦 Installation & Setup

### Prerequisites
- Python 3.10 or higher
- pip package manager
- Virtual environment (recommended)

### Step-by-Step Setup

**1. Clone the repository (or navigate to the project):**
```bash
cd ~/Desktop/kavach/Kavach
```

**2. Create and activate a virtual environment:**
```bash
# On macOS/Linux
python3 -m venv .venv
source .venv/bin/activate

# On Windows
python -m venv .venv
.venv\Scripts\activate
```

**3. Install dependencies:**
```bash
pip install -r requirements.txt
```

**4. (Optional) Set up environment variables:**
```bash
# Create a .env file in the project root
cat > .env << EOF
OPENROUTER_KEY=your_openrouter_api_key_here
EOF
```

The AI analyst feature will gracefully degrade if `OPENROUTER_KEY` is not set.

**5. Verify installation:**
```bash
python app.py
# Expected output: INFO:     Uvicorn running on http://127.0.0.1:8000
```

---

## 🎯 Running the Application

### Start the Server
```bash
python app.py
```

The application will start on `http://127.0.0.1:8000` with CORS enabled for local frontend development.

### Access Points
- **Landing Page:** http://127.0.0.1:8000/
- **Shield Dashboard:** http://127.0.0.1:8000/dashboard
- **Verify Module:** http://127.0.0.1:8000/company_accountant

### Session Management
- Sessions are stored in-memory with a **1-hour TTL**
- Each upload creates a new session
- Sessions are automatically cleaned up after expiration (prevents memory leaks)

---

## 📊 Data Formats & Examples

### Shield (Fraud Analytics)

**Required Columns:**
```
user_id, amount, category, merchant, country, timestamp
```

**Data Type Specifications:**
- `user_id`: String (any unique identifier)
- `amount`: Numeric (float or integer)
- `category`: String (merchant category)
- `merchant`: String (merchant/vendor name)
- `country`: String (country code or name, e.g., "India", "US")
- `timestamp`: Datetime (ISO format: YYYY-MM-DD HH:MM:SS)

**Sample Data:**
```csv
user_id,amount,category,merchant,country,timestamp
USER001,150.50,Groceries,Walmart,India,2024-01-15 10:30:00
USER002,5000.00,Travel,Emirates Airlines,UAE,2024-01-15 11:45:00
USER001,3500.00,Shopping,Amazon,India,2024-01-15 12:00:00
USER003,45.99,Dining,Starbucks,India,2024-01-15 13:15:00
USER002,200.00,Entertainment,Netflix,UAE,2024-01-15 14:20:00
```

**Built-in Sample Files:**
- `frontend/sample.xlsx` — Pre-configured transaction data
- `data/uploaded_transactions.xlsx` — Example dataset

**Column Alias Support (ingestion.py):**
The ingestion module accepts various column name variations:
- `date`, `timestamp`, `transaction_date`, `trans_date`
- `amount`, `value`, `transaction_amount`
- `category`, `type`, `merchant_category`
- etc.

---

### Verify (Company Financial Verification)

**Flexible Input:** Accepts **any** Excel (.xlsx, .xls) or CSV file structure.

**Auto-Detected Columns:**
- **Date Column:** Looks for variations like "Date", "Transaction Date", "Date of Transaction"
- **Amount Column:** Looks for "Amount", "Value", "Transaction Amount", "Sum"
- **Category Column:** Looks for "Category", "Type", "Description", "Account"

**If Detection Fails:**
The module generates a report with safe defaults and provides warnings in the response.

**Sample Excel Structure:**
```
Date            | Description           | Amount  | Category
2024-01-01      | Office Supplies       | 5000    | Admin
2024-01-02      | Marketing Campaign    | 25000   | Marketing
2024-01-03      | Employee Salaries     | 150000  | Payroll
2024-01-05      | Software Licenses     | 3000    | IT
```

**Built-in Sample Files:**
- `data/company_upload.xlsx` — Pre-configured company financials

---

## 🔌 API Routes & Documentation

### Shield Endpoints

#### 1. Upload Transactions
```http
POST /upload
Content-Type: multipart/form-data

Parameter: file (Binary)
```

**Response (200 OK):**
```json
{
  "upload_status": "success",
  "message": "Processed 150 transactions",
  "insights": {
    "total_spend": 45000.50,
    "top_categories": [
      {"category": "Shopping", "amount": 15000.00},
      {"category": "Travel", "amount": 10000.00},
      {"category": "Dining", "amount": 5000.50}
    ],
    "fraud_count": 8,
    "anomaly_count": 12,
    "user_count": 25
  },
  "fraud_table": [
    {
      "user_id": "USER045",
      "amount": 12000,
      "category": "Shopping",
      "merchant": "Unknown Vendor",
      "country": "Nigeria",
      "timestamp": "2024-01-15 09:30:00",
      "anomaly_severity": 0.87,
      "rule_based_fraud_flag": true,
      "model_fraud_flag": true,
      "fraud_score": 0.92
    }
  ]
}
```

**Error Responses:**
```json
{
  "detail": "No file provided"
}   // 400 Bad Request

{
  "detail": "Invalid file format. Expected .xlsx, .xls, or .csv"
}   // 400 Bad Request
```

---

#### 2. Get Dashboard Data
```http
GET /dashboard_data
```

**Response (200 OK):**
Returns comprehensive dashboard JSON:
```json
{
  "insights": {...},
  "fraud_table": [...],
  "user_profiles": [
    {
      "user_id": "USER001",
      "total_spend": 5000,
      "transaction_count": 12,
      "average_transaction": 416.67,
      "top_category": "Shopping",
      "flags": 2
    }
  ],
  "charts": {
    "monthly_trends": {"labels": [...], "data": [...]},
    "category_breakdown": {...}
  }
}
```

---

#### 3. Ask AI Analyst
```http
POST /ask_ai
Content-Type: application/json

{
  "question": "Why was transaction USER045's $12000 purchase flagged as fraudulent?"
}
```

**Response (200 OK - if OPENROUTER_KEY is set):**
```json
{
  "response": "Transaction USER045's $12,000 purchase was flagged due to:\n\n1. **Velocity Anomaly**: User hasn't spent >$10k in a single transaction historically\n2. **Geographic Anomaly**: First transaction from Nigeria (previous activity: India/UAE)\n3. **Category Shift**: Unusual category (Shopping) compared to user's typical spending pattern\n4. **Z-Score**: Amount is 4.2 standard deviations above user mean\n\nThe combination of these factors triggered both rule-based and model-based fraud flags.",
  "confidence": 0.94
}
```

**Error Responses:**
```json
{
  "detail": "No active session or no data uploaded yet"
}   // 400 Bad Request

{
  "detail": "AI analyst unavailable (OPENROUTER_KEY not configured)"
}   // 503 Service Unavailable
```

---

### Verify Endpoints

#### 1. Upload Company File
```http
POST /company_upload
Content-Type: multipart/form-data

Parameter: file (Binary)
```

**Response (200 OK):**
```json
{
  "status": "success",
  "report": {
    "summary": {
      "total_revenue": 250000.00,
      "total_expenses": 180000.00,
      "net_income": 70000.00,
      "gross_margin_percent": 28.0,
      "expense_ratio_percent": 72.0
    },
    "anomalies": [
      {
        "date": "2024-03-15",
        "amount": 45000.00,
        "category": "Marketing",
        "anomaly_score": 0.92,
        "flagged": true
      }
    ],
    "monthly_trends": {...},
    "category_totals": {...}
  }
}
```

---

#### 2. Get Company Report (JSON)
```http
GET /company_report
```

Returns the same JSON structure as `POST /company_upload`.

---

#### 3. Get Company Report (Excel)
```http
GET /company_report_excel
```

**Response (200 OK):**
- Content-Type: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- Binary Excel file with:
  - Formatted summary table
  - Embedded charts
  - Anomalies sheet
  - Monthly trends sheet
  - Category breakdown sheet

---

#### 4. Get Company Report (PDF)
```http
GET /company_report_pdf
```

**Response (200 OK):**
- Content-Type: `application/pdf`
- Multi-page PDF with:
  - Title page with verification stamp
  - Summary metrics
  - Anomalies section
  - Financial charts (matplotlib rendered as images)
  - Verification signature and certification

---

## 🤖 Understanding the ML Pipeline

### 1. Feature Engineering (`features.py`)

Generated transaction-level features:

| Feature | Calculation | Purpose |
|---------|-------------|---------|
| `user_cum_spend` | Cumulative user spend | Spending habit baseline |
| `user_category_spend` | Total spend per category | Category preference |
| `user_velocity` | Transactions per day | Activity pattern |
| `velocity_flag` | Velocity > threshold | Rapid spending detection |
| `rolling_mean` | 10-tx rolling mean | Spending trend |
| `rolling_std` | 10-tx rolling std | Variability detection |
| `z_score` | (amount - mean) / std | Statistical outliers |
| `z_score_flag` | Z-score > 3 sigma | Extreme outlier detection |
| `amount_anomaly_flag` | Amount anomoly detected | Unusual transaction size |
| `country_change` | Country != prev user country | Geographic anomaly |
| `calendar_features` | year, month, day, hour, dayofweek | Temporal patterns |

**Auto-Detection:**
- If your data contains an `is_fraud` column, it's used as labels for training
- Otherwise, rule-based features are used as weak supervision signals

---

### 2. Preprocessing (`preprocessing.py`)

**Steps:**
1. **Base Frame Prep:** Ensure timestamp is datetime, amounts are numeric
2. **Feature Extraction:** Calendar features (year, month, hour, day of week)
3. **Scaling:** StandardScaler on numeric features (mean=0, std=1)
4. **Encoding:** OneHotEncoder on categorical features (country, category, merchant)
5. **Pipeline:** All fitted transformers bundled in `PreprocessingArtifacts`

**Output:**
```python
artifacts = PreprocessingArtifacts(
    preprocessed_df=scaled_data,
    fitted_pipeline=sklearn.Pipeline(...),
    feature_names=["feature_1", "feature_2", ...]
)
```

---

### 3. Model Training (`train.py`)

**Model:** RandomForestClassifier
- **n_estimators:** 200 trees
- **class_weight:** "balanced" (handles imbalanced fraud/non-fraud)
- **max_depth:** Not limited (trees grow deep)
- **random_state:** 42 (reproducibility)

**Training Process:**
1. Load sample data or use provided dataset
2. Engineer features
3. Preprocess (scale, encode)
4. Split: 80% train, 20% validation
5. Train RandomForest
6. Evaluate: ROC-AUC, precision, recall, F1
7. Persist model as `model.pkl`

**Run Training:**
```bash
python train.py
```

---

### 4. Hyperparameter Tuning (`tune.py`)

Uses **Optuna** to optimize RandomForest hyperparameters:

**Search Space:**
- `n_estimators`: 100–400
- `max_depth`: 4–16
- `min_samples_leaf`: 1–10

**Objective:** Maximize ROC-AUC on validation set

**Run Tuning:**
```bash
python tune.py --n-trials 25
```

Output: Best hyperparameters printed to stdout.

---

### 5. Inference Pipeline

**At Runtime:**
1. Load pre-trained model (`model.pkl`)
2. Ingest transactions
3. Engineer features
4. Preprocess (using fitted pipeline)
5. Run model → fraud probability
6. Combine with rule-based flags:
   - `rule_based_fraud_flag` = any_of(z_score_flag, velocity_flag, country_change, amount_anomaly_flag)
   - `model_fraud_flag` = model_probability > 0.5
7. `fraud_score` = max(rule_based_probability, model_probability)
8. Aggregate into insights + flagged transactions table

---

## 📁 Project Structure

```
Kavach/
│
├── app.py                              # Main FastAPI application (624 lines)
│                                       # - Route definitions
│                                       # - Session management
│                                       # - File upload handlers
│                                       # - Report generation
│
├── requirements.txt                    # Python dependencies
├── README.md                           # This file
├── TODO.md                             # Open development items
├── .gitignore                          # Git ignore rules
│
├── frontend/                           # Frontend assets
│   ├── landing.html                    # Landing page UI
│   ├── landing.js                      # Landing page interactions
│   ├── dashboard.html                  # Shield dashboard UI
│   ├── script.js                       # Dashboard application logic (~93KB)
│   ├── company_accountant.html         # Verify module UI
│   ├── company_accountant.js           # Verify module interactions
│   ├── style.css                       # Design system & styles (~81KB)
│   ├── favicon.svg                     # Brand icon
│   └── sample.xlsx                     # Example transaction data
│
├── data/                               # Data folder
│   ├── README.md                       # Data documentation
│   ├── company_upload.xlsx             # Sample company financials
│   └── uploaded_transactions.xlsx      # Sample transactions
│
├── Core ML Modules (Data Pipeline)
│   ├── ingestion.py (253 lines)        # Excel/CSV loading & column mapping
│   ├── features.py (142 lines)         # Transaction feature engineering
│   ├── preprocessing.py (156 lines)    # Data scaling & encoding
│   ├── insights.py (216 lines)         # Business insights aggregation
│   └── company_accountant.py (420 lines) # CA module (anomalies, reports)
│
├── ML & Utilities
│   ├── genai.py (226 lines)            # OpenRouter AI integration
│   ├── train.py (116 lines)            # Model training script
│   └── tune.py (139 lines)             # Hyperparameter tuning (Optuna)
│
├── Generated/Runtime
│   ├── model.pkl                       # Trained RandomForest classifier
│   ├── .venv/                          # Python virtual environment
│   └── __pycache__/                    # Python bytecode cache
│
└── .env (optional)                     # Environment variables
                                        # (not in git; create locally)
```

### File Size Summary
- **Python:** 9 modules, ~2,292 total lines
  - Largest: `app.py` (624 lines)
  - Smallest: `train.py` (116 lines)
- **Frontend:** CSS (~81KB), JavaScript (~93KB)
- **Data:** Sample files for testing

---

## 🎨 Frontend Architecture

### Structure & Organization

**Landing Page** (`landing.html`, `landing.js`)
- Hero section with parallax effects
- Feature highlights (Shield & Verify)
- Floating stats animation
- Use case carousel
- Theme picker dropdown
- Counter animations
- Modal dialogs

**Shield Dashboard** (`dashboard.html`, `script.js`)
- Vanilla JS with Store pattern state management
- Modular DOM utilities
- Key UI Components:
  - Quick stats bar (KPIs, last scan time)
  - File upload with drag-drop zone
  - Dynamic KPI cards
  - Category spending chart (toggle: doughnut/bar)
  - Monthly trends chart (line with seasonal patterns)
  - Anomaly detection table (filterable, sortable)
  - Flagged transactions table (fraud/risk details)
  - User profiles panel (segmentation insights)
  - AI analyst chat interface (streaming responses)
- Performance Optimizations:
  - Debounced event handlers (file upload, search)
  - Throttled scroll events
  - Lazy chart rendering (only when visible)
  - Event delegation for dynamic tables
- Toast notifications for user feedback
- Pagination for large tables

**Verify Module** (`company_accountant.html`, `company_accountant.js`)
- Company financial analysis UI
- Upload interface for Excel/CSV
- Report generation with export buttons
- Summary metrics display
- Anomaly alerts
- Category breakdown visuals

### Design System

**Color Palette (OKLCH):**
- Base: Perceptually uniform color space
- Primary: Aurora blue (`oklch(45% 0.15 240)`)
- Secondary: Accent purple
- Success: Green
- Warning: Orange
- Error: Red

**Spacing Scale:**
- Base unit: 8px
- Scale: `--space-1` (4px) to `--space-8` (64px)

**Typography:**
- Headlines: Space Grotesk (sans-serif)
- Body: System fonts (font-stack)
- Code: Monospace

**Visual Effects:**
- **Glassmorphism:** Backdrop blur (10px), 30% opacity backgrounds
- **Shadows:** Layered shadows for depth (3 levels)
- **Animations:** Smooth transitions (200ms–400ms), easing functions

**Theme Support:**
- Themes persist in `localStorage` as `kavach_theme`
- CSS variables switch entire design system
- 4 built-in themes:
  - **Aurora Core** (default): Cool, professional
  - **Sweet Dark**: Dark mode with warm accents
  - **Dreamy**: Soft pastels
  - **Solar Copper**: Warm sunset palette

### Accessibility Features
- ARIA labels on interactive elements
- Keyboard navigation (Tab, Enter, Escape)
- Semantic HTML (buttons, inputs, tables)
- Color contrast ratios ≥ 4.5:1
- Focus indicators on all interactive elements

---

## ⚙️ Configuration & Environment

### Environment Variables

Create a `.env` file in the project root:

```bash
# Optional: OpenRouter API key for AI analyst feature
OPENROUTER_KEY=sk_...

# Optional: Custom port (default: 8000)
PORT=8000

# Optional: Debug mode
DEBUG=False
```

**Note:** The `.env` file is in `.gitignore` and not tracked in git.

### Loading Configuration

```python
# In app.py
from dotenv import load_dotenv
import os

load_dotenv()
openrouter_key = os.getenv("OPENROUTER_KEY", None)
```

### Session Configuration

**In `app.py`:**
```python
SESSION_TTL_HOURS = 1  # Sessions expire after 1 hour
```

Modify this value to adjust session lifetime.

---

## 👨‍💻 Development Guide

### Code Organization Philosophy

1. **Modularity:** Each file has a single responsibility
2. **Readability:** Verbose variable names over cryptic abbreviations
3. **Type Hints:** Modern Python 3.10+ with type annotations
4. **No Over-Engineering:** Simple solutions for simple problems
5. **Comments:** Only where logic isn't self-evident

### Running the App in Development Mode

```bash
# With auto-reload (requires watchdog)
pip install watchdog
uvicorn app:app --reload --host 127.0.0.1 --port 8000

# Or via Python script
python app.py
```

### Testing

**Currently:** No automated tests (academic demo).

**To Add Tests:**
```bash
pip install pytest pytest-asyncio
# Create tests/test_features.py, tests/test_ingestion.py, etc.
pytest tests/
```

### Making Code Changes

**For Feature Engineering:**
- Modify `features.py`
- Run `train.py` to retrain model
- Test in dashboard

**For UI Changes:**
- Edit `frontend/dashboard.html` or `script.js`
- Refresh browser (Ctrl+Shift+R for hard refresh)
- No server restart needed

**For API Changes:**
- Modify `app.py` routes
- Add new models in the same file (keep it simple)
- Test with cURL or Postman

### Common Development Tasks

**Add a new feature to Shield:**
1. Add logic to `features.py` (feature engineering)
2. Update `script.js` to display on dashboard
3. Update `insights.py` if aggregation needed

**Add a new visualization:**
1. Update `script.js` with Chart.js or Plotly config
2. Add calculation to `insights.py`
3. Call `/dashboard_data` endpoint

**Tune the model:**
```bash
python tune.py --n-trials 50
```

---

## 🐛 Troubleshooting

### Server Won't Start

**Error:** `Address already in use`
```bash
# Kill process using port 8000
# On macOS/Linux:
lsof -i :8000 | grep LISTEN | awk '{print $2}' | xargs kill -9

# On Windows (PowerShell):
netstat -ano | findstr :8000
taskkill /PID <PID> /F
```

**Error:** `No module named 'fastapi'`
```bash
# Reinstall dependencies
pip install -r requirements.txt
```

---

### Upload Errors

**Error:** `Invalid file format`
- Ensure file is `.xlsx`, `.xls`, or `.csv`
- Check file isn't corrupted
- Try opening in Excel to verify

**Error:** `No columns detected`
- Check column headers match expected names
- For Verify module, ensure at least one date/amount column exists

**Error:** `Memory error on large files`
- Limit uploads to <10MB
- Split large datasets into batches

---

### Dashboard Issues

**No charts appearing:**
- Check browser console (F12) for JavaScript errors
- Ensure Chart.js CDN loaded successfully
- Try clearing browser cache

**AI analyst not responding:**
- Check `OPENROUTER_KEY` is set correctly
- Verify internet connection
- OpenRouter API may be rate-limited (wait 60 seconds)

**404 on new routes:**
- FastAPI doesn't auto-reload embedded routes
- Restart the server: `python app.py`

---

### Performance Issues

**Slow dashboard with many transactions (>5000):**
- Pagination is applied automatically
- Charts render lazily (only when scrolled into view)
- Try splitting data into multiple uploads

**High memory usage:**
- Check session count (should be 1 per active user)
- Sessions auto-cleanup after 1 hour TTL
- Restart server if needed

---

## 📋 Known Issues & TODOs

### Open Issues

From `TODO.md`:
- **Flagged Transactions Filter:** "Flagged Transactions" section should filter to only show transactions with `rule_based_fraud_flag`, `model_fraud_flag`, or `fraud_score > 0.5` (not all flagged anomalies)

### Feature Requests

- [ ] User authentication & multi-user sessions
- [ ] Database backend (PostgreSQL) instead of in-memory
- [ ] Real-time alerting via webhook
- [ ] Model retraining pipeline
- [ ] Batch processing for large datasets
- [ ] Mobile app version
- [ ] Dark mode CSS refinement

### Optimization Opportunities

- Replace vanilla JS with React/Vue for large dashboards
- Implement caching layer (Redis) for heavy computations
- Add database indexing for faster queries
- Parallel processing for hyperparameter tuning (Ray, Dask)

---

## ⚡ Performance Considerations

### Current Constraints

- **In-Memory Session Store:** Suitable for ~10 concurrent users
- **Single-Process Uvicorn:** No horizontal scaling
- **Model Inference:** ~100ms per file (RandomForest prediction)
- **File Upload Size:** Recommended max 10MB

### Scaling Recommendations

**For 100+ concurrent users:**
1. Use database backend (PostgreSQL) instead of memory
2. Deploy with Gunicorn (multiple workers)
3. Add caching layer (Redis)
4. Use async task queue (Celery) for long-running reports

**For Real-Time Analytics:**
1. Add streaming data ingestion (WebSocket)
2. Implement incremental feature engineering
3. Cache model predictions
4. Use approximate algorithms (HyperLogLog for cardinality)

**For Model Training:**
1. Move training off the main thread (Celery task)
2. Use distributed training (DaskML, Ray)
3. Implement A/B testing framework
4. Add model versioning (MLflow)

---

## 📄 License

Academic / demo use only.

---

## 🤝 Contributing

This is an educational project. Contributions welcome:

1. Fork the project
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📞 Support & Questions

- Check the **Troubleshooting** section above
- Review **Known Issues & TODOs** for open items
- Examine existing code in `/app.py` and frontend files for examples
- Check environment variables in `.env` (optional)

---

## 🎓 Educational Value

KAVACH demonstrates:
- Modern FastAPI application design
- End-to-end ML pipeline (ingestion → preprocessing → training → inference)
- Interpretable ML with rule-based + model-based approaches
- Premium UI/UX with vanilla JavaScript
- Data validation with Pydantic
- Multi-format report generation (JSON, Excel, PDF)
- Production-grade error handling and logging
- Clean code practices and modular architecture

**Perfect for:**
- Learning fintech risk assessment
- Understanding ML in production
- Building admin dashboards
- Feature engineering techniques
- API design with FastAPI

---

**Last Updated:** March 2026
**Version:** 1.0
**Status:** Active Development
