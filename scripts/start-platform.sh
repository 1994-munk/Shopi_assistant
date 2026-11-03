#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if command -v docker >/dev/null 2>&1; then
  echo "Starting Postgres and Qdrant with Docker Compose..."
  docker compose up -d postgres qdrant
fi

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

echo "Backend will run on http://localhost:${APP_PORT:-8000}"
echo "Qdrant will run on http://localhost:6333"
echo "Postgres will run on localhost:5432"
