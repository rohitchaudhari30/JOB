import json
import logging
from typing import Dict, List, Optional
from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from app.core.security import decode_access_token

logger = logging.getLogger("app.ws")
router = APIRouter(tags=["WebSocket Live Stream"])


class ConnectionManager:
    """Manages active WebSocket connections grouped by user_id."""

    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, user_id: str, websocket: WebSocket):
        await websocket.accept()
        if user_id not in self.active_connections:
            self.active_connections[user_id] = []
        self.active_connections[user_id].append(websocket)
        logger.info(f"WebSocket connected for user: {user_id}. Active: {len(self.active_connections[user_id])}")

    def disconnect(self, user_id: str, websocket: WebSocket):
        if user_id in self.active_connections:
            if websocket in self.active_connections[user_id]:
                self.active_connections[user_id].remove(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]
        logger.info(f"WebSocket disconnected for user: {user_id}")

    async def broadcast_to_user(self, user_id: str, message: dict):
        if user_id in self.active_connections:
            dead_connections = []
            for connection in self.active_connections[user_id]:
                try:
                    await connection.send_text(json.dumps(message))
                except Exception:
                    dead_connections.append(connection)

            for dead in dead_connections:
                self.disconnect(user_id, dead)

    async def broadcast_bytes_to_user(self, user_id: str, data: bytes):
        """Streams binary data (raw JPEG / WebP frames) directly over WebSocket with zero base64 bloat."""
        if user_id in self.active_connections:
            dead_connections = []
            for connection in self.active_connections[user_id]:
                try:
                    await connection.send_bytes(data)
                except Exception:
                    dead_connections.append(connection)

            for dead in dead_connections:
                self.disconnect(user_id, dead)


ws_manager = ConnectionManager()


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: Optional[str] = Query(None)):
    user_id = "anonymous"
    if token:
        try:
            payload = decode_access_token(token)
            user_id = payload.get("sub", "anonymous")
        except Exception:
            await websocket.close(code=4001)
            return

    await ws_manager.connect(user_id, websocket)

    # Lazily import orchestrator to avoid circular imports
    from app.application.automation.orchestrator import orchestrator

    try:
        while True:
            data = await websocket.receive_text()
            try:
                command_payload = json.loads(data)
                command = (command_payload.get("command") or "").upper()
                run_id = command_payload.get("run_id")
                user_input = command_payload.get("input") or command_payload.get("user_input")

                logger.info(f"Received WebSocket command [{command}] for run [{run_id}] from user [{user_id}].")

                session = orchestrator.get_session(run_id) if run_id else orchestrator.get_active_user_run(user_id)

                status_msg = "processed"
                if session and session.user_id == user_id:
                    if command in ("PAUSE", "PAUSE_RUN"):
                        session.pause()
                    elif command in ("RESUME", "RESUME_RUN", "SUBMIT_INPUT"):
                        session.resume(user_input=user_input)
                    elif command in ("STOP", "STOP_RUN", "ABORT"):
                        session.abort(reason=user_input or "User stopped run via WebSocket")
                else:
                    status_msg = "no_active_session"

                # Send command acknowledgement back to client
                await websocket.send_text(
                    json.dumps(
                        {
                            "type": "COMMAND_ACK",
                            "command": command,
                            "run_id": session.run_id if session else run_id,
                            "status": status_msg,
                        }
                    )
                )
            except Exception as e:
                logger.warning(f"Malformed WebSocket command received: {e}")
    except WebSocketDisconnect:
        ws_manager.disconnect(user_id, websocket)
