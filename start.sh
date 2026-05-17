#!/bin/bash
# Start InvXt — frontend + backend
cd "$(dirname "$0")"

cleanup() {
  echo ""
  echo "Shutting down..."
  kill $FE_PID $BE_PID 2>/dev/null
  wait $FE_PID $BE_PID 2>/dev/null
  echo "Stopped."
}
trap cleanup EXIT INT TERM

# Backend
lsof -ti:8000 | xargs kill -9 2>/dev/null
echo "Starting backend on http://localhost:8000 ..."
/usr/bin/python3 -m uvicorn backend.api.main:app --host 0.0.0.0 --port 8000 --timeout-keep-alive 300 &
BE_PID=$!

# Frontend
lsof -ti:3000 | xargs kill -9 2>/dev/null
echo "Starting frontend on http://localhost:3000 ..."
cd frontend && npm run dev &
FE_PID=$!

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  InvXt running:"
echo "  Frontend → http://localhost:3000"
echo "  Backend  → http://localhost:8000"
echo "  Press Ctrl+C to stop both"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

wait
