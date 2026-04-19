# WorkfinderX

AI-powered job discovery platform that automates the entire application pipeline: **search → score → tailor resume → generate cover letter → email**.

Built with FastAPI, React, and Google Gemini AI.

---

## Features

- **Multi-platform job scraping** — LinkedIn, Indeed, Glassdoor, ZipRecruiter via jobspy
- **AI scoring** — Gemini scores each job against your resume (0–100%)
- **Resume tailoring** — AI rewrites your resume bullets for each matched role
- **Cover letter generation** — personalised cover letter per job
- **Auto email** — sends your tailored application via SMTP when score exceeds threshold
- **Kanban board** — drag-and-drop pipeline (Discovered → Applied → Interview → Offer → Rejected)
- **Daily scheduler** — runs searches automatically at a configured time
- **Admin panel** — user management, job monitoring, system health, activity feed
- **httpOnly cookie auth** — secure JWT sessions, email verification, account lockout

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | FastAPI, SQLAlchemy, SQLite |
| Frontend | React 18, Vite, Tailwind CSS, TanStack Query |
| AI | Google Gemini 2.0 Flash |
| Email | Resend SMTP (or any SMTP provider) |
| Auth | JWT + bcrypt, httpOnly cookies |
| Proxy | Nginx |
| Deployment | Docker Compose, Coolify |

---

## Deploy on Coolify

### 1 — Prerequisites

- A server with [Coolify](https://coolify.io) installed (or Coolify Cloud)
- This repo connected to your Coolify instance

### 2 — Create resource in Coolify

1. **New Resource → Docker Compose**
2. Connect this GitHub repo, branch `main`
3. Docker Compose file: `docker-compose.yml`

### 3 — Environment variables

Set these in Coolify's **Environment Variables** tab:

```env
# AI
GOOGLE_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-2.0-flash

# Auth
SECRET_KEY=a_long_random_secret_string_at_least_32_chars
ACCESS_TOKEN_EXPIRE_MINUTES=10080

# SMTP (example uses Resend)
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_EMAIL=resend
SMTP_PASSWORD=re_your_resend_api_key
SMTP_FROM_EMAIL=noreply@yourdomain.com

# App
MATCH_THRESHOLD=75
COOKIE_SECURE=true
ADMIN_EMAIL=your@email.com
FRONTEND_URL=https://yourapp.yourdomain.com
```

### 4 — Domain

1. Add your domain in Coolify's **Domains** tab
2. Point an `A` record at your server IP in your DNS provider
3. Enable HTTPS — Coolify handles Let's Encrypt automatically

### 5 — Deploy

Hit **Deploy**. Coolify builds both images and starts the stack. The SQLite database is persisted in a named Docker volume (`db_data`) and survives all future redeployments.

### 6 — First login

Register an account, then verify your email. The `ADMIN_EMAIL` user is automatically granted admin access on each server start.

---

## Local Development

### Backend

```bash
cd backend
python -m venv venv
# Windows
venv\Scripts\activate
# macOS/Linux
source venv/bin/activate

pip install -r requirements.txt
cp .env.example .env   # fill in your keys
uvicorn main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev            # http://localhost:5173
```

Vite proxies `/api` to `http://localhost:8000` automatically.

---

## Environment Variables Reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `GOOGLE_API_KEY` | ✅ | — | Gemini API key from Google AI Studio |
| `GEMINI_MODEL` | | `gemini-2.0-flash` | Gemini model ID |
| `SECRET_KEY` | ✅ | — | JWT signing secret (min 32 chars) |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | | `10080` | Session duration (7 days) |
| `SMTP_HOST` | ✅ | — | SMTP server hostname |
| `SMTP_PORT` | | `465` | 465 = SSL, 587 = STARTTLS |
| `SMTP_EMAIL` | ✅ | — | SMTP username |
| `SMTP_PASSWORD` | ✅ | — | SMTP password or API key |
| `SMTP_FROM_EMAIL` | ✅ | — | From address on sent emails |
| `MATCH_THRESHOLD` | | `75` | Minimum score (0–100) to trigger email |
| `COOKIE_SECURE` | | `false` | Set `true` in production (requires HTTPS) |
| `ADMIN_EMAIL` | | — | Email of the user to auto-grant admin |
| `FRONTEND_URL` | | — | Full URL of the frontend (for email links) |

---

## Project Structure

```
AutoJob-Finder/
├── backend/
│   ├── main.py              # FastAPI app, lifespan, admin bootstrap
│   ├── models.py            # SQLAlchemy ORM models
│   ├── database.py          # Engine, session, migrations
│   ├── config.py            # Environment config
│   ├── requirements.txt
│   ├── Dockerfile
│   └── routers/
│       ├── auth.py          # Login, register, verify email, cookies
│       ├── jobs.py          # Job CRUD, stats, kanban
│       ├── search.py        # Multi-platform search + pipeline
│       ├── pipeline.py      # Manual score→tailor→email
│       ├── admin.py         # Admin panel API
│       ├── user_router.py   # Profile, resume upload/delete
│       ├── activity.py      # Activity log
│       └── ...
├── frontend/
│   ├── src/
│   │   ├── pages/           # Feed, Search, Board, Config, Profile, Admin
│   │   ├── components/      # Layout, Sidebar, Toast, Logo
│   │   ├── store/           # Zustand auth store
│   │   └── api/             # apiFetch client
│   ├── Dockerfile
│   └── vite.config.ts
├── docker-compose.yml
└── nginx.conf
```
