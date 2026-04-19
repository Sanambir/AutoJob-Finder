# ── Stage 1: build the Vite React app ───────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build        # outputs to /app/dist

# ── Stage 2: serve with Nginx ────────────────────────────────────────────────
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
# nginx.conf is injected by docker-compose volume mount
EXPOSE 80
