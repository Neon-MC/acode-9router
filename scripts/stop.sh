#!/bin/sh
DATA_DIR="${DATA_DIR:-/public/.9router}"
PID_FILE="$DATA_DIR/server.pid"

echo "[*] Stopping 9Router..."

# 1. Terminate process registered in PID_FILE
if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE" 2>/dev/null | tr -d ' \n\r\t')
    if [ -n "$PID" ] && [ "$PID" != "$$" ] && [ "$PID" != "$PPID" ]; then
        kill -15 "$PID" 2>/dev/null || true
        # Brief wait for graceful termination
        for i in 1 2 3; do
            if ! kill -0 "$PID" 2>/dev/null; then
                break
            fi
            sleep 0.3
        done
        # Force kill if still responding
        if kill -0 "$PID" 2>/dev/null; then
            kill -9 "$PID" 2>/dev/null || true
        fi
    fi
    rm -f "$PID_FILE"
fi

# 2. Safe scan of /proc to terminate any remaining 9Router instances
# Strictly ignores the script itself ($$), parent process ($PPID) and init (PID 1)
for p in /proc/[0-9]*; do
    [ -d "$p" ] || continue
    pid="${p##*/}"
    [ "$pid" != "$$" ] && [ "$pid" != "$PPID" ] && [ "$pid" != "1" ] || continue
    if [ -f "$p/cmdline" ]; then
        if grep -F -q "custom-server.js" "$p/cmdline" 2>/dev/null; then
            kill -9 "$pid" 2>/dev/null || true
        fi
    fi
done

# 3. Terminate auxiliary cloudflared processes on port 20128 if any
for p in /proc/[0-9]*; do
    [ -d "$p" ] || continue
    pid="${p##*/}"
    [ "$pid" != "$$" ] && [ "$pid" != "$PPID" ] && [ "$pid" != "1" ] || continue
    if [ -f "$p/cmdline" ]; then
        if grep -F -q "20128" "$p/cmdline" 2>/dev/null && grep -F -q "cloudflared" "$p/cmdline" 2>/dev/null; then
            kill -9 "$pid" 2>/dev/null || true
        fi
    fi
done

echo "[+] 9Router stopped successfully."
exit 0
