FROM node:22-bookworm-slim AS frontend
WORKDIR /app
COPY scripts/build-frontend.mjs ./scripts/build-frontend.mjs
COPY client ./client
RUN node scripts/build-frontend.mjs

FROM python:3.12-slim-bookworm AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 APP_ENV=production
WORKDIR /app
COPY backend/requirements.txt backend/constraints.txt ./backend/
RUN pip install --no-cache-dir -r backend/requirements.txt \
    && useradd --create-home --uid 10001 florea
COPY backend ./backend
COPY --from=frontend /app/client/dist ./client/dist
USER florea
EXPOSE 4000
CMD ["python", "backend/manage.py", "serve"]
