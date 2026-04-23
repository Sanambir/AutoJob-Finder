FROM python:3.11-slim

WORKDIR /app

# Install deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source
COPY . .

# Ensure the data directory exists for the SQLite volume mount
RUN mkdir -p /app/data

EXPOSE 8000
# --timeout-keep-alive 75: keep idle HTTP connections alive for 75s.
# Default is 5s — Cloudflare reuses connections from its pool for longer,
# causing it to send a request on a connection uvicorn already closed → 504.
# 75s matches Cloudflare's origin keep-alive window.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--timeout-keep-alive", "75"]
