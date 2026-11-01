#!/bin/sh

PORT="${PORT:-20128}"
HOST="${HOST:-127.0.0.1}"
DATA_DIR="${DATA_DIR:-/public/.9router}"
RUNTIME_DIR="$DATA_DIR/runtime/node_modules"
PID_FILE="$DATA_DIR/server.pid"
LOG_FILE="$DATA_DIR/server.log"

mkdir -p "$DATA_DIR"

# 1. Check if already running
if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE" 2>/dev/null || true)
    if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
        echo "[!] 9Router is already running (PID: $OLD_PID on port $PORT)."
        exit 0
    fi
    rm -f "$PID_FILE"
fi

# 2. Locate standalone custom-server.js
SERVER_JS=""
for CANDIDATE in \
    "/usr/local/lib/node_modules/9router/app/custom-server.js" \
    "/usr/lib/node_modules/9router/app/custom-server.js" \
    "$HOME/.npm-global/lib/node_modules/9router/app/custom-server.js"; do
    if [ -f "$CANDIDATE" ]; then
        SERVER_JS="$CANDIDATE"
        break
    fi
done

if [ -z "$SERVER_JS" ]; then
    echo "[-] Error: 9Router custom-server.js not found."
    exit 1
fi

echo "[*] Starting 9Router at http://$HOST:$PORT ..."

# 3. Launch process with nohup to survive terminal session
nohup env PORT="$PORT" \
    HOSTNAME="$HOST" \
    DATA_DIR="$DATA_DIR" \
    NODE_PATH="$RUNTIME_DIR" \
    node "$SERVER_JS" > "$LOG_FILE" 2>&1 < /dev/null &

PID=$!
echo "$PID" > "$PID_FILE"

# 4. Wait for server readiness
MAX_TRIES=60
COUNT=0
READY=0

while [ $COUNT -lt $MAX_TRIES ]; do
    if curl -s "http://$HOST:$PORT/api/health" 2>/dev/null | grep -q "ok"; then
        READY=1
        break
    fi
    if ! kill -0 "$PID" 2>/dev/null; then
        echo "[-] Process exited unexpectedly. Recent logs:"
        cat "$LOG_FILE"
        rm -f "$PID_FILE"
        exit 1
    fi
    sleep 0.5
    COUNT=$((COUNT + 1))
done

if [ $READY -eq 1 ]; then
    echo "[+] 9Router started successfully! (PID: $PID)"
    echo "    URL: http://$HOST:$PORT"
    echo "    Log: $LOG_FILE"
    exit 0
else
    echo "[-] Timeout waiting for 9Router on http://$HOST:$PORT."
    exit 1
fi
