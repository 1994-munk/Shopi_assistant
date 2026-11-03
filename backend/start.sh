#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ -f "$ROOT_DIR/backend/.env" ]; then
  set -a
  . "$ROOT_DIR/backend/.env"
  set +a
fi

if [ -f "$ROOT_DIR/.env.local" ]; then
  set -a
  . "$ROOT_DIR/.env.local"
  set +a
fi

if [ -z "${OPENAI_API_KEY:-}" ] && [ -z "${DATABASE_URL:-}" ] && [ "${VECTOR_BACKEND:-in_memory}" = "in_memory" ]; then
  echo "Starting in local demo mode. Environment is not fully configured for model, vector, or Postgres backends."
fi

python -m uvicorn backend.app:app --host 0.0.0.0 --port "${APP_PORT:-8000}" --reload
