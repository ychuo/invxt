# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common commands

```bash
# Start everything (frontend + backend)
./start.sh

# Start infrastructure only (Neo4j, PostgreSQL, Redis)
docker compose up -d neo4j postgres redis

# Start frontend only
cd frontend && npm run dev

# Start backend only
/usr/bin/python3 -m uvicorn backend.api.main:app --host 0.0.0.0 --port 8000

# Frontend build check
cd frontend && npx next build

# Backend health check
curl http://localhost:8000/api/health
```

`./start.sh` kills existing processes on ports 8000 and 3000 before starting, and SIGINT cleans up both.

## Architecture

InvXt is an AI-driven theme investment analysis tool: user inputs a topic (e.g., "HBM"), the system decomposes the industry chain, maps to A-share/US companies, and scores by exposure relevance.

### Backend (FastAPI)

**Analysis pipeline** (`backend/services/pipeline.py`): 5-step sequential workflow orchestrated by `AnalysisPipeline`. Each step runs as a background task (`asyncio.create_task`), state persisted to Redis per task_id. Steps: Search → Theme Understanding → Chain Reasoning → Company Mapping → Scoring. Only one LLM call at a time (global `Semaphore(1)`).

**LLM client** (`backend/services/llm_client.py`): OpenAI-compatible API via httpx. Config in `.env` (`LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`). Returns raw text, callers handle JSON extraction. Includes robust parsing: BOM removal, markdown fence stripping, bracket-depth tracking for truncated JSON, single retry with +2048 tokens.

**Routes** (`backend/api/routes/`):
- `analyze.py` — POST `/api/analyze` submits a topic, returns task_id. Per-topic async lock deduplicates concurrent requests. Initial state written to Redis before background task starts.
- `theme.py` — GET `/api/theme/{task_id}` for polling results; GET `/api/theme/by-name/{name}` for cached topic lookup. Topic cache only written on COMPLETED status (not on failures).
- `company.py` — Company detail endpoints.
- `graph_route.py` — GET `/api/graph/{theme_name}` returns Neo4j graph data for Sankey visualization.
- `search.py` — Entity search.
- `trending.py` — GET `/api/trending?market=A` returns LLM-generated forward-looking theme recommendations. 6-hour Redis cache, only caches non-empty results.

**Knowledge graph** (`backend/kg/neo4j_client.py`): Neo4j with 6 node types (Theme, Technology, Material, Equipment, Product, Company) and 6 edge types (REQUIRES, USES_MATERIAL, USES_EQUIPMENT, PRODUCES, SUPPLIES, EXPOSED_TO). Graph queries split into 4 small queries to avoid Cartesian explosion. Data cleared at pipeline START before writing new analysis results.

**Vector store** (`backend/kg/vector_store.py`): PostgreSQL + pgvector for semantic similarity search, using bge-m3 embeddings.

**Search** (`backend/services/search_client.py`): Tavily SDK for real-time web search during analysis step 0. Results used to inform downstream LLM reasoning.

**Trending** (`backend/services/trending_service.py`): LLM generates insightful (not just hot) theme recommendations with temperature 0.8 for diversity.

### Frontend (Next.js 14 App Router)

- `reactStrictMode: false` in next.config.js (prevents double-mount double-fetch).
- `frontend/src/lib/api.ts`: in-flight request dedup via `_inflight` Map — concurrent calls reuse the same promise.
- Design system: Georgia serif font throughout, teal accent (#0d9488→#14b8a6), CSS variables in globals.css.
- Analysis page (`/analysis?q=<topic>&market=A`): sticky nav with IntersectionObserver scroll tracking, progressive block rendering with skeleton loading states.

### Infrastructure

- **Neo4j 5**: Graph database (bolt://localhost:7687)
- **PostgreSQL 16 + pgvector**: Relational + vector storage (localhost:5432)
- **Redis 7**: Cache for analysis state and trending topics (localhost:6379)
- All run via Docker Compose. `.env` at project root for credentials.

### Key design decisions

- Python 3.9 compatibility: `from __future__ import annotations` for `X | None` syntax.
- Polling over WebSocket: frontend polls `/api/theme/{task_id}` every 2s. Original WebSocket approach caused deadlocks.
- Chain data written to Neo4j immediately after chain reasoning completes (not waiting for full pipeline), so the graph renders progressively.
- Scoring uses rank-based approach: LLM sorts companies by exposure, system maps rank to 0-100 percentile score.
- Cleanup runs at pipeline START (not in scoring step) to avoid deleting edges after they're written.
- Company name cleanup: regex strips suffixes like "股份有限公司", "有限公司".
