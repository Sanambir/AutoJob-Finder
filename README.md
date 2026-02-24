# ResumeFlow AI 🚀

An AI-powered job discovery and resume tailoring tool. Automatically scrapes jobs from LinkedIn, Indeed, Glassdoor, and ZipRecruiter, scores each against your resume using Gemini AI, and emails tailored resume suggestions + a cover letter for every match above your threshold.

## Features

- 🔍 **Multi-platform job scraping** — LinkedIn, Indeed, Glassdoor, ZipRecruiter via jobspy
- 🤖 **AI match scoring** — Gemini scores each job against your resume (0–100)
- ✍️ **Auto tailoring** — Numbered resume suggestions + cover letter generated per match
- 📧 **Email notifications** — Sends results automatically when score ≥ threshold
- 📊 **Live dashboard** — Feed with inline expandable suggestions/cover letters
- ⚙️ **Configurable** — Threshold, model, and SMTP settings all via `.env`

## Stack

| Layer | Tech |
|-------|------|
| Backend | FastAPI (Python 3.11) |
| AI | Google Gemini (`google-genai`) |
| Scraping | python-jobspy |
| Frontend | Vanilla React (ESM, no build step) |
| Email | SMTP + ReportLab PDF |

## Quick Start

### 1. Clone & set up backend

```bash
git clone https://github.com/YOUR_USERNAME/JobTool.git
cd JobTool/backend

# Create Python 3.11 virtual environment
python3.11 -m venv venv311
venv311/bin/pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your API keys
```

### 2. Run the backend

```bash
cd backend
venv311/bin/uvicorn main:app --reload --port 8000
```

### 3. Run the frontend

```bash
cd frontend
python3 -m http.server 3000
```

Open **http://localhost:3000**

## Configuration (`.env`)

| Variable | Description | Default |
|----------|-------------|---------|
| `GOOGLE_API_KEY` | Gemini API key from [aistudio.google.com](https://aistudio.google.com) | required |
| `GEMINI_MODEL` | Gemini model to use | `gemini-3-flash-preview` |
| `MATCH_THRESHOLD` | Min score (0–100) to trigger tailoring/email | `75` |
| `SMTP_EMAIL` | Gmail address for sending emails | optional |
| `SMTP_PASSWORD` | Gmail App Password | optional |

> **Note:** Copy `.env.example` to `.env` — never commit `.env` directly.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/search` | Start a job search pipeline |
| `POST` | `/api/pipeline` | Manual job pipeline (paste JD) |
| `GET` | `/api/jobs` | List all jobs |
| `GET` | `/api/jobs/{id}` | Get job details |
| `GET/PATCH` | `/api/config` | Read/update match threshold |

## Project Structure

```
JobTool/
├── backend/
│   ├── main.py              # FastAPI app
│   ├── config.py            # Env-based configuration
│   ├── requirements.txt
│   ├── .env.example
│   ├── routers/
│   │   ├── search.py        # Job search + pipeline
│   │   ├── jobs.py          # Job CRUD
│   │   ├── pipeline.py      # Manual pipeline
│   │   ├── score.py         # Scoring endpoint
│   │   └── config_router.py # Threshold config
│   └── services/
│       ├── job_scraper.py   # jobspy scraping
│       ├── scorer.py        # Gemini scoring
│       ├── tailor_service.py# Gemini tailoring
│       ├── email_service.py # SMTP + PDF
│       ├── pdf_service.py   # Cover letter PDF
│       └── gemini_retry.py  # Retry with backoff
└── frontend/
    └── index.html           # Single-file React dashboard
```

## License

MIT
