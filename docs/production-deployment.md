# Production deployment checklist

This project is designed to be deployed as a small AI commerce platform with a frontend, a FastAPI backend, PostgreSQL, and Qdrant.

## Recommended deployment shape

- Frontend: Vite app hosted on a static hosting provider or a Node-based web runtime
- Backend: FastAPI app in a container or platform service
- Database: PostgreSQL for durable session storage
- Vector store: Qdrant for retrieval and semantic matching
- Monitoring: telemetry summary endpoints and logs

## Required environment variables

Set these values in the deployment environment before bringing up the app:

```bash
APP_ENV=production
APP_PORT=8000
OPENAI_API_KEY=your-key
OPENAI_MODEL=gpt-4o-mini
OPENAI_API_BASE=https://api.openai.com/v1
LLM_PROVIDER=openai
USE_LANGGRAPH=false
VECTOR_BACKEND=qdrant
QDRANT_URL=http://qdrant:6333
QDRANT_API_KEY=
QDRANT_COLLECTION=shopi-products
DATABASE_URL=postgresql://shopi:shopi@postgres:5432/shopi
```

## Local platform stack

Use Docker Compose from the repo root:

```bash
docker compose up -d
```

This starts:

- PostgreSQL on port 5432
- Qdrant on port 6333
- the app can then connect to those services through the configured hostnames in Docker networking

## Containerized backend

Build the backend image:

```bash
docker build -f backend/Dockerfile -t shopi-backend .
```

Run it:

```bash
docker run -p 8000:8000 --env-file backend/.env shopi-backend
```

## Frontend deployment

The frontend can be deployed independently from the backend:

```bash
npm install
npm run build
```

Then serve the generated `dist` directory with a static hosting service, while wiring `VITE_SHOPI_API_URL` to the backend URL.

## Production checklist

- [ ] Set strong secrets for OpenAI and database credentials
- [ ] Use a managed Postgres instance for production traffic
- [ ] Use a managed Qdrant or self-hosted Qdrant with proper persistence
- [ ] Configure CORS deliberately instead of allowing all origins
- [ ] Add auth and role checks before any customer-facing admin routes
- [ ] Add structured logs and database-backed trace IDs
- [ ] Add health probes and alerting for backend latency and errors
- [ ] Add model evaluation and safety review for production prompts

## Operational notes

The app is intentionally set up to degrade gracefully when model or vector services are absent. That makes local development and staged deployment easier while still leaving a clear path to production maturity.
