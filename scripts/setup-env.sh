#!/bin/sh
set -e

DATA_DIR="${DATA_DIR:-/public/.9router}"
CUSTOM_SERVER_PATH="${CUSTOM_SERVER_PATH:-/usr/local/lib/node_modules/9router/app/custom-server.js}"

mkdir -p "$DATA_DIR/db"

# 1. Configure SQLite settings (requireLogin: false)
node -e '
const fs = require("fs");
const path = require("path");
const dataDir = process.env.DATA_DIR || "'"$DATA_DIR"'";
const dbDir = path.join(dataDir, "db");
fs.mkdirSync(dbDir, { recursive: true });

try {
  const { DatabaseSync } = require("node:sqlite");
  const dbPath = path.join(dbDir, "data.sqlite");
  const db = new DatabaseSync(dbPath);
  db.exec("CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL)");
  db.prepare("INSERT INTO settings (id, data) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data").run(JSON.stringify({ requireLogin: false }));
  console.log("[+] SQLite configured: requireLogin=false");
} catch (e) {
  console.log("[!] Note on SQLite:", e.message);
}
'

# 2. Inject PID management patch into custom-server.js for clean shutdown
if [ -f "$CUSTOM_SERVER_PATH" ]; then
  node -e '
const fs = require("fs");
const path = require("path");
const serverFile = "'"$CUSTOM_SERVER_PATH"'";
const dataDir = "'"$DATA_DIR"'";
if (fs.existsSync(serverFile)) {
  let content = fs.readFileSync(serverFile, "utf8");
  if (!content.includes("server.pid")) {
    const patch = `
// Write server PID for reliable lifecycle management
const DATA_DIR = process.env.DATA_DIR || "${dataDir}";
try {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(path.join(DATA_DIR, "server.pid"), String(process.pid));
} catch (e) {}

const cleanupPid = () => {
  try {
    const pidFile = path.join(DATA_DIR, "server.pid");
    if (fs.existsSync(pidFile)) fs.unlinkSync(pidFile);
  } catch (e) {}
};
process.on("exit", cleanupPid);
process.on("SIGTERM", () => { cleanupPid(); process.exit(0); });
process.on("SIGINT", () => { cleanupPid(); process.exit(0); });
`;
    content = content.replace("const origCreate", patch + "\nconst origCreate");
    fs.writeFileSync(serverFile, content, "utf8");
    console.log("[+] custom-server.js patched for PID management");
  }
}
'
fi

# 3. Create stop.sh script in DATA_DIR
cat << 'EOF' > "$DATA_DIR/stop.sh"
#!/bin/sh
PID_FILE="/public/.9router/server.pid"
if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE" 2>/dev/null | tr -d " \n\r\t")
  if [ -n "$PID" ] && [ "$PID" != "$$" ] && [ "$PID" != "$PPID" ]; then
    kill -15 "$PID" 2>/dev/null || true
    for i in 1 2 3; do
      kill -0 "$PID" 2>/dev/null || break
      sleep 0.3
    done
    kill -9 "$PID" 2>/dev/null || true
  fi
  rm -f "$PID_FILE"
fi
pkill -f "custom-server.js" 2>/dev/null || true
exit 0
EOF
chmod +x "$DATA_DIR/stop.sh"

# 4. Create installation marker
date -Iseconds > "$DATA_DIR/.installed" 2>/dev/null || touch "$DATA_DIR/.installed"
echo "[+] 9Router environment configured successfully!"
