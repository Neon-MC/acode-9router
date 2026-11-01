#!/bin/sh

PORT="${PORT:-20128}"
HOST="${HOST:-127.0.0.1}"
DATA_DIR="${DATA_DIR:-/public/.9router}"
PID_FILE="$DATA_DIR/server.pid"

if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE" 2>/dev/null || true)
    if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
        HEALTH=$(curl -s "http://$HOST:$PORT/api/health" 2>/dev/null || true)
        if echo "$HEALTH" | grep -q "ok"; then
            echo "[+] STATUS: RUNNING (PID: $PID, Port: $PORT)"
            echo "    Health: $HEALTH"
            exit 0
        else
            echo "[!] STATUS: PROCESS ALIVE (PID: $PID), but port $PORT is not answering yet."
            exit 1
        fi
    fi
fi

echo "[-] STATUS: STOPPED"
exit 2
