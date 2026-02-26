---
description: Deploy ResumeFlow AI backend to Render and frontend to Vercel
---

# Deploy ResumeFlow AI

## Prerequisites
- Render account: https://render.com
- Vercel account: https://vercel.com
- Your `.env` secrets ready

---

## 1. Deploy Backend to Render

### a. Push to GitHub
```bash
cd /Users/sanam/JobTool
git init
git add .
git commit -m "Initial ResumeFlow AI commit"
gh repo create resumeflow-ai --public --push
```

### b. Create Render Web Service
1. Go to https://render.com/dashboard → **New → Web Service**
2. Connect your GitHub repo
3. Set the following:
   - **Root Directory**: `backend`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
   - **Instance Type**: Free (or Starter for production)

### c. Add Environment Variables on Render
In the Render dashboard → **Environment**, add:
```
GOOGLE_API_KEY        = <your key>
ANTHROPIC_API_KEY     = <your key>
MATCH_THRESHOLD       = 75
SMTP_HOST             = smtp.gmail.com
SMTP_PORT             = 587
SMTP_EMAIL            = your@gmail.com
SMTP_PASSWORD         = <app password>
FRONTEND_URL          = https://your-app.vercel.app
```

4. Click **Deploy**. Your API will be live at `https://resumeflow-ai.onrender.com`.

---

## 2. Deploy Frontend to Vercel

### a. Update API URL
Edit `frontend/index.html`, line ~95:
```js
// Change:
const API = 'http://localhost:8000/api';
// To:
const API = 'https://resumeflow-ai.onrender.com/api';
```

### b. Deploy via Vercel CLI
```bash
npm i -g vercel
cd /Users/sanam/JobTool/frontend
vercel --prod
```
Follow the prompts:
- **Framework**: Other
- **Root directory**: `./` (the frontend folder)
- **Build command**: *(leave empty)*
- **Output directory**: `./`

Or drag-and-drop the `frontend/` folder at https://vercel.com/new.

Your frontend will be live at `https://resumeflow-ai.vercel.app`.

---

## 3. Verify Deployment

// turbo
```bash
curl https://resumeflow-ai.onrender.com/health
# Expected: {"status":"ok","service":"ResumeFlow AI"}
```

Open `https://resumeflow-ai.vercel.app` — the dashboard should load and connect to the Render API.

---

## 4. Custom Domain (optional)
- Render: Settings → Custom Domain → Add `api.yourdomain.com`
- Vercel: Settings → Domains → Add `yourdomain.com`
- Update `FRONTEND_URL` on Render and `API` const in `index.html`
