#!/bin/sh
# AetherWeave production start script.
# Tunable through environment variables so one image can run on 2C, 4C, or 8C hosts.

set -e

PORT="${PORT:-8080}"
WORKERS="${WEB_CONCURRENCY:-2}"
THREADS="${GUNICORN_THREADS:-4}"
TIMEOUT="${GUNICORN_TIMEOUT:-120}"
KEEP_ALIVE="${GUNICORN_KEEP_ALIVE:-5}"
MAX_REQUESTS="${GUNICORN_MAX_REQUESTS:-1000}"
MAX_REQUESTS_JITTER="${GUNICORN_MAX_REQUESTS_JITTER:-50}"

echo "Starting AetherWeave on :${PORT}"
echo "Gunicorn workers=${WORKERS}, threads=${THREADS}, timeout=${TIMEOUT}s"
echo "Build app_version=${APP_VERSION:-unknown}, commit=${GIT_COMMIT:-unknown}, branch=${GIT_BRANCH:-unknown}, built=${BUILD_TIME:-unknown}"

exec gunicorn \
  --bind "0.0.0.0:${PORT}" \
  --worker-class gthread \
  --workers "${WORKERS}" \
  --threads "${THREADS}" \
  --timeout "${TIMEOUT}" \
  --keep-alive "${KEEP_ALIVE}" \
  --max-requests "${MAX_REQUESTS}" \
  --max-requests-jitter "${MAX_REQUESTS_JITTER}" \
  --access-logfile - \
  --error-logfile - \
  --log-level info \
  "backend.scripts.server:create_app()"
