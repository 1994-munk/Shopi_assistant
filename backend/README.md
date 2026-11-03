# Shopi Backend

This backend is the platform layer for the Shopi shopping assistant. It is intentionally readable and built to mirror a real AI product architecture without hiding the important decisions behind heavy abstractions.

## Core responsibilities

- API layer for the frontend
- orchestration and intent routing
- retrieval and ranking abstraction
- durable session storage
- telemetry and evaluation hooks
- optional model integration via OpenAI or Azure OpenAI
- optional LangGraph-based orchestration path

## Local startup

From the repo root:

```bash
cp backend/.env.example backend/.env
# optional: cp .env.example .env.local
bash backend/start.sh
```

This script loads environment variables from `backend/.env` and `.env.local`, then starts the FastAPI app.

## Runtime configuration

The backend reads the following configuration keys:

- `APP_PORT`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OPENAI_API_BASE`
- `LLM_PROVIDER`
- `USE_LANGGRAPH`
- `VECTOR_BACKEND`
- `QDRANT_URL`
- `DATABASE_URL`

## Notes

- The app works in local demo mode without a model or external storage layer.
- When `USE_LANGGRAPH=true`, the app attempts to use the graph workflow defined in `langgraph_ready.py`.
- When `VECTOR_BACKEND=qdrant`, the adapter tries to sync the local catalog into a Qdrant collection.
- When `DATABASE_URL` is set, the app uses Postgres-backed session storage instead of SQLite.
