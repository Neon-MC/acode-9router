#!/bin/sh
set -e

echo "=== [9Router Bridge] 9Router Installation for Alpine proot ==="

# 1. Check Node.js
if ! command -v node >/dev/null 2>&1; then
    echo "[-] Node.js not found. Installing via apk..."
    apk add --no-cache nodejs npm
fi

NODE_VER=$(node -v | tr -d 'v')
NODE_MAJOR=$(echo "$NODE_VER" | cut -d. -f1)

if [ "$NODE_MAJOR" -lt 18 ]; then
    echo "[-] Node.js version ($NODE_VER) is below 18. Please upgrade Node.js."
    exit 1
fi

echo "[+] Node.js v$NODE_VER detected."

# 2. Install 9Router globally
if ! command -v 9router >/dev/null 2>&1; then
    echo "[*] Installing 9router globally via npm..."
    npm install -g 9router --prefer-online
else
    echo "[+] 9router is already installed globally."
fi

# 3. Initialize SQLite runtime for 9Router
echo "[*] Initializing SQLite runtime (sql.js / node:sqlite)..."
9router --version >/dev/null 2>&1 || true

# 4. Create data directory and configure requireLogin: false for seamless local access
DATA_DIR="${DATA_DIR:-$HOME/.9router}"
mkdir -p "$DATA_DIR/db"

node -e '
const fs = require("fs");
const path = require("path");
const dataDir = process.env.DATA_DIR || path.join(process.env.HOME || "/root", ".9router");
const dbPath = path.join(dataDir, "db", "data.sqlite");

try {
    const { DatabaseSync } = require("node:sqlite");
    const db = new DatabaseSync(dbPath);
    db.exec("CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL)");
    db.prepare("INSERT INTO settings (id, data) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data").run(JSON.stringify({ requireLogin: false }));
    console.log("[+] Local configuration (requireLogin=false) applied successfully.");
} catch (e) {
    console.log("[!] Database notice:", e.message);
}
'

echo "[+] 9Router installation and configuration finished successfully!"
