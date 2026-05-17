#!/bin/bash
# Start InvXt backend server
cd "$(dirname "$0")"
lsof -ti:8000 | xargs kill -9 2>/dev/null
sleep 1
echo "Starting backend on http://localhost:8000 ..."
/usr/bin/python3 -m uvicorn backend.api.main:app --host 0.0.0.0 --port 8000 --timeout-keep-alive 300
