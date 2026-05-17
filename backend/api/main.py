from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from backend.api.routes import analyze, theme, company, graph_route, search
from backend.api.ws import analyze_ws

app = FastAPI(title="InvXt", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(analyze.router, prefix="/api")
app.include_router(theme.router, prefix="/api")
app.include_router(company.router, prefix="/api")
app.include_router(graph_route.router, prefix="/api")
app.include_router(search.router, prefix="/api")


@app.websocket("/ws/analyze/{task_id}")
async def ws_analyze(websocket: WebSocket, task_id: str):
    await analyze_ws.analyze_websocket(websocket, task_id)


@app.get("/api/health")
async def health():
    return {"status": "ok"}
