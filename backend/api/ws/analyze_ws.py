from fastapi import WebSocket, WebSocketDisconnect
from backend.services.pipeline import AnalysisPipeline, AnalysisState


async def analyze_websocket(websocket: WebSocket, task_id: str):
    await websocket.accept()
    pipeline = AnalysisPipeline()

    async def on_step(state: AnalysisState):
        try:
            await websocket.send_json({
                "type": "progress",
                "step": state.current_step,
                "status": state.status.value,
                "data": state.to_dict(),
            })
        except Exception:
            pass

    pipeline.on_step(on_step)

    try:
        data = await websocket.receive_json()
        topic = data.get("topic", "")
        market = data.get("market", "A")

        await pipeline.run(topic, market)
        await websocket.send_json({"type": "done"})
    except WebSocketDisconnect:
        pass
    except Exception as e:
        await websocket.send_json({"type": "error", "message": str(e)})
