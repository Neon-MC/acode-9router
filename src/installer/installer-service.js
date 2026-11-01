import { execute, executeVerbose } from "../bridge/executor.js";
import { logger } from "../utils/logger.js";

const CUSTOM_SERVER_PATH =
  "/usr/local/lib/node_modules/9router/app/custom-server.js";
const DATA_DIR = "/public/.9router";

export const installerService = {
  /**
   * Fast check if 9Router and its required runtime are fully present.
   * Matches acode-opencode checkInstalled pattern:
   * Returns true only if node, 9router binary, and custom-server.js all exist.
   * Any non-zero exit code throws and safely returns false.
   *
   * @returns {Promise<boolean>}
   */
  async isInstalled() {
    try {
      await execute("which node");
      await execute("which 9router");
      await execute(`test -f ${CUSTOM_SERVER_PATH}`);
      logger.info("installerService.isInstalled: true");
      return true;
    } catch {
      logger.info("installerService.isInstalled: false");
      return false;
    }
  },

  /**
   * Run the full onboarding installation sequence with real-time progress callbacks.
   *
   * @param {Function} onStatus - Callback for current main step (string)
   * @param {Function} onProgress - Callback for real-time terminal lines (string)
   */
  async install(onStatus, onProgress) {
    logger.info("Starting automated 9Router installation flow...");

    // 1. Check and install system runtime (Node.js & npm)
    onStatus?.("Checking system dependencies...");
    let hasRuntime = false;
    try {
      await execute("which node");
      await execute("which npm");
      hasRuntime = true;
    } catch {
      hasRuntime = false;
    }

    if (!hasRuntime) {
      onStatus?.("Installing Node.js and npm in Alpine...");
      logger.info("Installing nodejs and npm via apk add...");
      try {
        await executeVerbose("apk add --no-cache --verbose nodejs npm", onProgress);
      } catch (err) {
        throw new Error(`Failed to install system dependencies (apk add): ${err.message || err}`);
      }
    }

    // 2. Check and install 9router npm package
    onStatus?.("Checking 9Router package...");
    let hasRouter = false;
    try {
      await execute("which 9router");
      await execute(`test -f ${CUSTOM_SERVER_PATH}`);
      hasRouter = true;
    } catch {
      hasRouter = false;
    }

    if (!hasRouter) {
      onStatus?.("Downloading and installing 9Router...");
      logger.info("Installing 9router globally via npm...");
      try {
        await executeVerbose("npm install -g --loglevel verbose 9router", onProgress);
      } catch (err) {
        throw new Error(`Failed to download and install 9Router (npm): ${err.message || err}`);
      }
    }

    // 3. Configure SQLite database (requireLogin: false) & lifecycle PID patch
    onStatus?.("Configuring database and environment...");
    logger.info("Configuring SQLite database and server PID tracking...");
    try {
      await this.configureEnvironment();
    } catch (err) {
      logger.warn("configureEnvironment warning:", err);
    }

    onStatus?.("Environment ready!");
    logger.info("9Router installation completed successfully.");
  },

  /**
   * Set up local SQLite database with login bypassed and patch custom-server.js for PID handling
   */
  async configureEnvironment() {
    const setupScript = `
const fs = require('fs');
const path = require('path');
const dataDir = process.env.DATA_DIR || '${DATA_DIR}';
const dbDir = path.join(dataDir, 'db');
fs.mkdirSync(dbDir, { recursive: true });

try {
  const { DatabaseSync } = require('node:sqlite');
  const dbPath = path.join(dbDir, 'data.sqlite');
  const db = new DatabaseSync(dbPath);
  db.exec('CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL)');
  db.prepare('INSERT INTO settings (id, data) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data').run(JSON.stringify({ requireLogin: false }));
} catch (e) {}

const serverFile = '${CUSTOM_SERVER_PATH}';
if (fs.existsSync(serverFile)) {
  let content = fs.readFileSync(serverFile, 'utf8');
  if (!content.includes('server.pid')) {
    const patch = \`
// Write server PID for reliable lifecycle management
const DATA_DIR = process.env.DATA_DIR || "\${dataDir}";
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
\`;
    content = content.replace('const origCreate', patch + '\\nconst origCreate');
    fs.writeFileSync(serverFile, content, 'utf8');
  }
}

try {
  const stopSh = "#!/bin/sh\\n" +
    "PID_FILE=\\"" + dataDir + "/server.pid\\"\\n" +
    "if [ -f \\"$PID_FILE\\" ]; then\\n" +
    "  PID=$(cat \\"$PID_FILE\\" 2>/dev/null | tr -d \\" \\\\n\\\\r\\\\t\\")\\n" +
    "  if [ -n \\"$PID\\" ] && [ \\"$PID\\" != \\"$$\\" ] && [ \\"$PID\\" != \\"$PPID\\" ]; then\\n" +
    "    kill -15 \\"$PID\\" 2>/dev/null || true\\n" +
    "    kill -9 \\"$PID\\" 2>/dev/null || true\\n" +
    "  fi\\n" +
    "  rm -f \\"$PID_FILE\\"\\n" +
    "fi\\n" +
    "pkill -f \\"custom-server.js\\" 2>/dev/null || true\\n" +
    "exit 0\\n";
  fs.writeFileSync(path.join(dataDir, "stop.sh"), stopSh, { mode: 0o755 });
} catch (e) {}

try {
  fs.writeFileSync(path.join(dataDir, '.installed'), new Date().toISOString());
} catch (e) {}
`;

    const b64 = typeof btoa === "function"
      ? btoa(unescape(encodeURIComponent(setupScript)))
      : Buffer.from(setupScript).toString("base64");

    await execute(`node -e "eval(Buffer.from('${b64}','base64').toString())"`);
  },
};
