#!/usr/bin/env bash
# SHARP Primer Designer — start backend and frontend
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"
ENV_TYPE_FILE="$ROOT/.python_env_type"

if [ ! -f "$ENV_TYPE_FILE" ]; then
    echo "Run ./scripts/setup.sh first"
    exit 1
fi

ENV_TYPE=$(head -1 "$ENV_TYPE_FILE")

echo "Starting SHARP Primer Designer..."

# Activate the right Python environment
if [ "$ENV_TYPE" = "conda" ]; then
    CONDA_ENV_NAME=$(sed -n '2p' "$ENV_TYPE_FILE")
    CONDA_BASE="$(conda info --base)"
    source "$CONDA_BASE/etc/profile.d/conda.sh"
    conda activate "$CONDA_ENV_NAME"
else
    source "$ROOT/backend/venv/bin/activate"
fi

# Start backend
echo "  Backend  → http://localhost:8000"
cd "$ROOT/backend"
uvicorn main:app --reload --port 8000 &
BACKEND_PID=$!

# Wait for backend to start
sleep 2

# Start frontend
echo "  Frontend → http://localhost:5173"
cd "$ROOT/frontend"
npm run dev &
FRONTEND_PID=$!

# Open browser
sleep 3
if command -v open &>/dev/null; then
    open http://localhost:5173
elif command -v xdg-open &>/dev/null; then
    xdg-open http://localhost:5173
fi

echo ""
echo "Press Ctrl+C to stop both servers"

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" INT TERM
wait
