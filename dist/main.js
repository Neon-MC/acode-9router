(() => {
  // src/ui/icons.js
  var ROUTER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="2.5"/><circle cx="12" cy="4" r="2"/><circle cx="19.6" cy="9.5" r="2"/><circle cx="16.7" cy="18.5" r="2"/><circle cx="7.3" cy="18.5" r="2"/><circle cx="4.4" cy="9.5" r="2"/><path d="M12 9.5V6"/><path d="m14.4 11.2 3.3-1.1"/><path d="m13.5 14 2 2.9"/><path d="m10.5 14-2 2.9"/><path d="m9.6 11.2-3.3-1.1"/></svg>`;
  var ICON_CLASS = "acode-9router-icon";
  var ICON_MASK = `url("data:image/svg+xml,${encodeURIComponent(ROUTER_SVG)}") center / contain no-repeat`;
  function installIcon() {
    const existing = document.getElementById("acode-9router-icon-style");
    if (existing) existing.remove();
    const style = document.createElement("style");
    style.id = "acode-9router-icon-style";
    style.textContent = `
    .icon.${ICON_CLASS} {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
    }
    .icon.${ICON_CLASS}::before {
      content: "" !important;
      display: inline-block !important;
      width: 1em !important;
      height: 1em !important;
      background: currentColor !important;
      -webkit-mask: ${ICON_MASK} !important;
      mask: ${ICON_MASK} !important;
      vertical-align: middle !important;
    }
  `;
    document.head.append(style);
    return () => {
      style.remove();
    };
  }

  // src/utils/logger.js
  var PREFIX = "[9Router-Bridge]";
  var logger = {
    info(...args) {
      console.log(PREFIX, ...args);
    },
    warn(...args) {
      console.warn(PREFIX, ...args);
    },
    error(...args) {
      console.error(PREFIX, ...args);
    },
    debug(...args) {
      console.debug(PREFIX, ...args);
    }
  };

  // src/bridge/http-client.js
  var DEFAULT_BASE_URL = "http://127.0.0.1:20128";
  function getCordovaHttp() {
    var _a, _b;
    return (_b = (_a = window == null ? void 0 : window.cordova) == null ? void 0 : _a.plugin) == null ? void 0 : _b.http;
  }
  function getExecutor() {
    return window == null ? void 0 : window.Executor;
  }
  var httpClient = {
    baseUrl: DEFAULT_BASE_URL,
    /**
     * Fast, non-blocking check whether 9Router is currently alive.
     * Prioritizes Alpine terminal curl (fastest and immune to WebView CORS/networking issues).
     * Falls back to native Cordova HTTP and standard Fetch API.
     *
     * @param {number} [timeoutMs=2500] - Probe timeout in milliseconds
     * @returns {Promise<boolean>}
     */
    async checkHealth(timeoutMs = 2500) {
      const executor = getExecutor();
      if (executor == null ? void 0 : executor.execute) {
        try {
          const out = await executor.execute(
            `curl -s -m 2 ${this.baseUrl}/api/health`,
            true
          );
          if (typeof out === "string" && out.includes('"ok":true')) {
            return true;
          }
        } catch {
        }
      }
      const cordovaHttp = getCordovaHttp();
      if (cordovaHttp) {
        return new Promise((resolve) => {
          let settled = false;
          const settle = (val) => {
            if (settled) return;
            settled = true;
            resolve(val);
          };
          const timer = setTimeout(() => settle(false), timeoutMs);
          try {
            cordovaHttp.sendRequest(
              `${this.baseUrl}/api/health`,
              { method: "GET", timeout: Math.max(1, Math.floor(timeoutMs / 1e3)) },
              () => {
                clearTimeout(timer);
                settle(true);
              },
              (error) => {
                clearTimeout(timer);
                const status = typeof (error == null ? void 0 : error.status) === "number" ? error.status : 0;
                settle(status > 0);
              }
            );
          } catch {
            clearTimeout(timer);
            settle(false);
          }
        });
      }
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        const res = await fetch(`${this.baseUrl}/api/health`, {
          method: "GET",
          headers: { Accept: "application/json" },
          signal: controller.signal
        });
        clearTimeout(timer);
        const data = await res.json().catch(() => null);
        return res.ok && (data == null ? void 0 : data.ok) === true;
      } catch {
        return false;
      }
    }
  };

  // src/bridge/9router-service.js
  var DATA_DIR = "/public/.9router";
  var SERVER_JS = "/usr/local/lib/node_modules/9router/app/custom-server.js";
  var RUNTIME_DIR = "/public/.9router/runtime/node_modules";
  var LOG_FILE = `${DATA_DIR}/server.log`;
  var STOP_SCRIPT = `${DATA_DIR}/stop.sh`;
  var BG_UUID_KEY = "acode_9router_bg_uuid";
  var SERVER_COMMAND = `env PORT=20128 HOSTNAME=127.0.0.1 DATA_DIR=${DATA_DIR} NODE_PATH=${RUNTIME_DIR} node ${SERVER_JS}`;
  var READY_TIMEOUT = 3e4;
  var POLL_INTERVAL = 1e3;
  function getExecutor2() {
    return window == null ? void 0 : window.Executor;
  }
  var routerService = {
    isStarting: false,
    isStopping: false,
    backgroundUuid: null,
    /**
     * Check if 9Router is currently alive
     */
    async isRunning() {
      return httpClient.checkHealth();
    },
    /**
     * Start 9Router server inside Alpine proot
     *
     * @param {Function} [onProgress] - Optional status progress callback
     * @returns {Promise<boolean>}
     */
    async start(onProgress) {
      var _a;
      if (this.isStarting) return false;
      if (await this.isRunning()) {
        logger.info("9Router is already running.");
        return true;
      }
      this.isStarting = true;
      try {
        const executor = getExecutor2();
        if (!executor) {
          throw new Error("Acode Executor not available. Please run inside Acode with Alpine terminal installed.");
        }
        onProgress == null ? void 0 : onProgress("Preparing port 20128...");
        try {
          if (executor.execute) {
            await executor.execute(`sh ${STOP_SCRIPT}`, true).catch(() => {
            });
            await executor.execute("pkill -f custom-server.js", true).catch(() => {
            });
          }
        } catch (e) {
          logger.debug("Cleanup notice:", e);
        }
        onProgress == null ? void 0 : onProgress("Starting 9Router server in Alpine...");
        logger.info(`Launching daemon: ${SERVER_COMMAND}`);
        if ((_a = executor.BackgroundExecutor) == null ? void 0 : _a.start) {
          this.backgroundUuid = await executor.BackgroundExecutor.start(
            SERVER_COMMAND,
            (type, data) => {
              logger.debug(`[9Router ${type}]`, data);
              if (type === "stdout" || type === "stderr") {
                const lines = data.split("\n").filter(Boolean);
                const lastLine = lines.pop();
                if (lastLine) {
                  const trimmed = lastLine.trim();
                  if (!trimmed.startsWith("proot warning:")) {
                    onProgress == null ? void 0 : onProgress(trimmed);
                  }
                }
              }
            },
            true
            // Run inside Alpine
          );
          if (this.backgroundUuid) {
            try {
              localStorage.setItem(BG_UUID_KEY, this.backgroundUuid);
            } catch {
            }
          }
          logger.info(`9Router background task started, uuid=${this.backgroundUuid}`);
        } else if (executor.execute) {
          const nohupCmd = `nohup ${SERVER_COMMAND} > ${LOG_FILE} 2>&1 < /dev/null &`;
          logger.info(`Fallback launch via execute: ${nohupCmd}`);
          await executor.execute(nohupCmd, true);
        } else {
          throw new Error("No execution mechanism found in Executor.");
        }
        const startedAt = Date.now();
        while (Date.now() - startedAt < READY_TIMEOUT) {
          const elapsedSec = Math.round((Date.now() - startedAt) / 1e3);
          onProgress == null ? void 0 : onProgress(`Starting 9Router... (${elapsedSec}s/30s)`);
          const online = await this.isRunning();
          if (online) {
            logger.info(`9Router is online after ${elapsedSec}s!`);
            return true;
          }
          await new Promise((r) => setTimeout(r, POLL_INTERVAL));
        }
        const logSnippet = await this.getLogs(15);
        throw new Error(
          `9Router started, but port 20128 did not respond within 30 seconds.
Recent logs:
${logSnippet}`
        );
      } finally {
        this.isStarting = false;
      }
    },
    /**
     * Stop 9Router server gracefully and forcefully if needed
     *
     * @param {Function} [onProgress] - Optional status progress callback
     * @returns {Promise<boolean>}
     */
    async stop(onProgress) {
      var _a;
      if (this.isStopping) return false;
      this.isStopping = true;
      try {
        const executor = getExecutor2();
        onProgress == null ? void 0 : onProgress("Stopping 9Router...");
        const uuid = this.backgroundUuid || (typeof localStorage !== "undefined" ? localStorage.getItem(BG_UUID_KEY) : null);
        if (uuid && ((_a = executor == null ? void 0 : executor.BackgroundExecutor) == null ? void 0 : _a.stop)) {
          try {
            await executor.BackgroundExecutor.stop(uuid);
          } catch (e) {
            logger.debug("BackgroundExecutor.stop notice:", e);
          }
        }
        this.backgroundUuid = null;
        try {
          localStorage.removeItem(BG_UUID_KEY);
        } catch {
        }
        if (executor == null ? void 0 : executor.execute) {
          try {
            await executor.execute(`sh ${STOP_SCRIPT}`, true).catch(() => {
            });
          } catch (e) {
            logger.warn("Stop script notice:", e);
          }
          try {
            await executor.execute("pkill -15 -f custom-server.js", true).catch(() => {
            });
          } catch {
          }
        }
        for (let i = 0; i < 8; i++) {
          await new Promise((r) => setTimeout(r, 400));
          const running = await this.isRunning();
          if (!running) {
            logger.info("9Router confirmed stopped.");
            return true;
          }
        }
        if (await this.isRunning() && (executor == null ? void 0 : executor.execute)) {
          try {
            await executor.execute("pkill -9 -f custom-server.js", true).catch(() => {
            });
            await executor.execute(`rm -f ${DATA_DIR}/server.pid`, true).catch(() => {
            });
          } catch {
          }
          await new Promise((r) => setTimeout(r, 500));
        }
        const stopped = !await this.isRunning();
        if (stopped) {
          logger.info("9Router successfully stopped.");
        }
        return stopped;
      } finally {
        this.isStopping = false;
      }
    },
    /**
     * Read recent server logs
     *
     * @param {number} [lines=35] - Number of lines to tail
     * @returns {Promise<string>}
     */
    async getLogs(lines = 35) {
      const executor = getExecutor2();
      if (!(executor == null ? void 0 : executor.execute)) {
        return "(Executor not available to read logs)";
      }
      try {
        const output = await executor.execute(`tail -n ${lines} ${LOG_FILE}`, true);
        return output || "(No logs recorded yet)";
      } catch {
        return "(No logs recorded yet)";
      }
    }
  };

  // src/bridge/executor.js
  function getExecutor3() {
    return typeof window !== "undefined" ? window.Executor : null;
  }
  async function execute(command, alpine = true) {
    const executor = getExecutor3();
    if (!(executor == null ? void 0 : executor.execute)) {
      throw new Error("Acode Executor not available. Please run inside Acode with Alpine terminal.");
    }
    return executor.execute(command, alpine);
  }
  async function executeVerbose(command, onProgress, alpine = true) {
    var _a;
    logger.info(`executeVerbose: launching "${command}"`);
    const executor = getExecutor3();
    if ((_a = executor == null ? void 0 : executor.BackgroundExecutor) == null ? void 0 : _a.start) {
      return new Promise((resolve, reject) => {
        let stdout = "";
        let settled = false;
        executor.BackgroundExecutor.start(
          command,
          (type, data) => {
            if (settled) return;
            if (type === "stdout" || type === "stderr") {
              stdout += data;
              if (onProgress) {
                const lines = data.split("\n").map((l) => l.trim()).filter(Boolean);
                if (lines.length > 0) {
                  onProgress(lines[lines.length - 1]);
                }
              }
            } else if (type === "exit") {
              settled = true;
              const exitCode = parseInt(data, 10);
              if (exitCode === 0) {
                logger.info(`executeVerbose: exited OK: ${command}`);
                resolve(stdout);
              } else {
                logger.error(`executeVerbose: exited with code ${exitCode}`);
                reject(
                  new Error(
                    `Command failed with code ${exitCode}.
Output:
${stdout}`
                  )
                );
              }
            }
          },
          alpine
        ).catch((err) => {
          if (!settled) {
            settled = true;
            reject(err);
          }
        });
      });
    }
    return execute(command, alpine);
  }

  // src/installer/installer-service.js
  var CUSTOM_SERVER_PATH = "/usr/local/lib/node_modules/9router/app/custom-server.js";
  var DATA_DIR2 = "/public/.9router";
  var installerService = {
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
      onStatus == null ? void 0 : onStatus("Checking system dependencies...");
      let hasRuntime = false;
      try {
        await execute("which node");
        await execute("which npm");
        hasRuntime = true;
      } catch {
        hasRuntime = false;
      }
      if (!hasRuntime) {
        onStatus == null ? void 0 : onStatus("Installing Node.js and npm in Alpine...");
        logger.info("Installing nodejs and npm via apk add...");
        try {
          await executeVerbose("apk add --no-cache --verbose nodejs npm", onProgress);
        } catch (err) {
          throw new Error(`Failed to install system dependencies (apk add): ${err.message || err}`);
        }
      }
      onStatus == null ? void 0 : onStatus("Checking 9Router package...");
      let hasRouter = false;
      try {
        await execute("which 9router");
        await execute(`test -f ${CUSTOM_SERVER_PATH}`);
        hasRouter = true;
      } catch {
        hasRouter = false;
      }
      if (!hasRouter) {
        onStatus == null ? void 0 : onStatus("Downloading and installing 9Router...");
        logger.info("Installing 9router globally via npm...");
        try {
          await executeVerbose("npm install -g --loglevel verbose 9router", onProgress);
        } catch (err) {
          throw new Error(`Failed to download and install 9Router (npm): ${err.message || err}`);
        }
      }
      onStatus == null ? void 0 : onStatus("Configuring database and environment...");
      logger.info("Configuring SQLite database and server PID tracking...");
      try {
        await this.configureEnvironment();
      } catch (err) {
        logger.warn("configureEnvironment warning:", err);
      }
      onStatus == null ? void 0 : onStatus("Environment ready!");
      logger.info("9Router installation completed successfully.");
    },
    /**
     * Set up local SQLite database with login bypassed and patch custom-server.js for PID handling
     */
    async configureEnvironment() {
      const setupScript = `
const fs = require('fs');
const path = require('path');
const dataDir = process.env.DATA_DIR || '${DATA_DIR2}';
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
      const b64 = typeof btoa === "function" ? btoa(unescape(encodeURIComponent(setupScript))) : Buffer.from(setupScript).toString("base64");
      await execute(`node -e "eval(Buffer.from('${b64}','base64').toString())"`);
    }
  };

  // src/ui/spinner.js
  var SPINNER_DEG_PER_SEC = 270;
  function createSpinner(statusText = "Setting up 9Router...") {
    const container = document.createElement("div");
    container.className = "as-onboarding-container";
    const ring = document.createElement("div");
    ring.className = "as-spinner-ring";
    container.appendChild(ring);
    const label = document.createElement("p");
    label.className = "as-spinner-label";
    label.textContent = statusText;
    container.appendChild(label);
    const progress = document.createElement("p");
    progress.className = "as-spinner-progress";
    progress.style.visibility = "hidden";
    container.appendChild(progress);
    let angle = 0;
    let lastTime = performance.now();
    let rafId = null;
    function tick(now) {
      const dt = (now - lastTime) / 1e3;
      lastTime = now;
      angle = (angle + SPINNER_DEG_PER_SEC * dt) % 360;
      ring.style.transform = `rotate(${angle}deg)`;
      rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);
    return {
      element: container,
      setStatus: (text) => {
        label.textContent = text;
      },
      setProgress: (text) => {
        progress.textContent = text;
        progress.style.visibility = text ? "visible" : "hidden";
      },
      stop: () => {
        if (rafId) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
      }
    };
  }

  // src/ui/sidebar.js
  function toast(msg) {
    if (window.toast) {
      window.toast(msg);
    } else {
      console.log("[Toast]", msg);
    }
  }
  var GEAR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
  <circle cx="12" cy="12" r="3"/>
</svg>`;
  var PLAY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
  <polygon points="6 3 20 12 6 21 6 3"/>
</svg>`;
  var STOP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
  <rect x="4" y="4" width="16" height="16" rx="2"/>
</svg>`;
  var SPINNER_SVG = `<svg class="as-spin" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
  <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
</svg>`;
  var CHEVRON_SVG = `<svg class="as-chevron" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <polyline points="6 9 12 15 18 9"/>
</svg>`;
  var SidebarApp = class {
    constructor() {
      this.container = null;
      this.isOnline = false;
      this.isWorking = false;
      this.logs = [];
      this.spinner = null;
    }
    async mount(container) {
      this.container = container;
      this.renderShell();
      const isReady = await installerService.isInstalled();
      if (isReady) {
        this.renderMainView();
        await this.refresh();
      } else {
        this.startInstallFlow();
      }
    }
    renderShell() {
      if (!this.container) return;
      this.container.innerHTML = `
      <div class="acode-agent-sidebar-host">
        <div class="acode-agent-sidebar">
          <!-- Header (matching Acode AI Agent design) -->
          <header class="as-head">
            <div class="as-mark" aria-hidden="true">
              ${ROUTER_SVG}
            </div>
            <div class="as-head-info">
              <b>9Router</b>
              <small class="as-head-version">v1.0.0</small>
            </div>
            <div class="as-head-actions">
              <button type="button" class="as-icon-btn" id="as-btn-settings" title="Settings (Web Dashboard)" aria-label="Settings">
                ${GEAR_SVG}
              </button>
            </div>
          </header>

          <!-- Dynamic body host: switches between Onboarding / Main view -->
          <div id="as-body-host" style="flex: 1; display: flex; flex-direction: column; min-height: 0; overflow: hidden;"></div>
        </div>
      </div>
    `;
      const btnSettings = this.container.querySelector("#as-btn-settings");
      btnSettings == null ? void 0 : btnSettings.addEventListener("click", () => this.openDashboard());
    }
    /**
     * Run the automated installation flow with animated spinner and live output streaming
     */
    async startInstallFlow() {
      var _a, _b, _c, _d, _e;
      const bodyHost = (_a = this.container) == null ? void 0 : _a.querySelector("#as-body-host");
      if (!bodyHost) return;
      bodyHost.innerHTML = "";
      this.spinner = createSpinner("Checking environment...");
      bodyHost.appendChild(this.spinner.element);
      try {
        await installerService.install(
          (status) => {
            var _a2;
            return (_a2 = this.spinner) == null ? void 0 : _a2.setStatus(status);
          },
          (progress) => {
            var _a2;
            return (_a2 = this.spinner) == null ? void 0 : _a2.setProgress(progress);
          }
        );
        (_b = this.spinner) == null ? void 0 : _b.setStatus("Environment ready!");
        (_c = this.spinner) == null ? void 0 : _c.setProgress("");
        await new Promise((r) => setTimeout(r, 900));
        (_d = this.spinner) == null ? void 0 : _d.stop();
        this.spinner = null;
        this.addLog("Environment ready.", "online");
        this.addLog("Ready to start on port 20128.", "info");
        this.renderMainView();
        await this.refresh();
      } catch (err) {
        logger.error("Automated installation error:", err);
        (_e = this.spinner) == null ? void 0 : _e.stop();
        this.spinner = null;
        this.renderInstallError(err);
      }
    }
    renderInstallError(err) {
      var _a;
      const bodyHost = (_a = this.container) == null ? void 0 : _a.querySelector("#as-body-host");
      if (!bodyHost) return;
      const errMsg = (err == null ? void 0 : err.message) || String(err);
      bodyHost.innerHTML = `
      <div class="as-onboarding-error">
        <div class="as-error-badge">\u26A0\uFE0F</div>
        <b class="as-error-title">Setup Failed</b>
        <p class="as-error-desc">Unable to download or prepare 9Router. Please check your internet connection and try again.</p>
        <div class="as-error-log">${errMsg}</div>
        <button type="button" class="as-btn-retry" id="as-btn-retry">Try Again</button>
      </div>
    `;
      const btnRetry = bodyHost.querySelector("#as-btn-retry");
      btnRetry == null ? void 0 : btnRetry.addEventListener("click", () => {
        this.startInstallFlow();
      });
    }
    renderMainView() {
      var _a;
      const bodyHost = (_a = this.container) == null ? void 0 : _a.querySelector("#as-body-host");
      if (!bodyHost) return;
      bodyHost.innerHTML = `
      <!-- Scrollable body -->
      <div class="as-scroll scroll">
        <!-- Signature CTA button (matching as-create-project) -->
        <button class="as-create-project" type="button" id="as-btn-toggle">
          <span id="as-cta-icon-box" class="as-cta-icon">
            ${PLAY_SVG}
          </span>
          <span>
            <b id="as-cta-title">Start 9Router</b>
            <small id="as-cta-sub">Launch local server on port 20128</small>
          </span>
        </button>

        <!-- Section: Service Status -->
        <section class="as-section expanded" id="sec-status">
          <button class="as-section-toggle" type="button" data-sec="sec-status">
            ${CHEVRON_SVG}
            <span>Service Status</span>
            <small id="as-status-badge" class="as-badge as-badge-offline">OFFLINE</small>
          </button>
          <div class="as-section-content">
            <div class="as-log-box" id="as-log-box"></div>
          </div>
        </section>
      </div>
    `;
      this.bindMainEvents();
      this.renderLogs();
    }
    bindMainEvents() {
      var _a, _b;
      const btnToggle = (_a = this.container) == null ? void 0 : _a.querySelector("#as-btn-toggle");
      btnToggle == null ? void 0 : btnToggle.addEventListener("click", () => {
        if (this.isOnline) {
          this.handleStop();
        } else {
          this.handleStart();
        }
      });
      const toggles = ((_b = this.container) == null ? void 0 : _b.querySelectorAll(".as-section-toggle")) || [];
      toggles.forEach((btn) => {
        btn.addEventListener("click", () => {
          var _a2;
          const secId = btn.getAttribute("data-sec");
          const sec = (_a2 = this.container) == null ? void 0 : _a2.querySelector(`#${secId}`);
          if (sec) {
            sec.classList.toggle("expanded");
          }
        });
      });
    }
    /**
     * Append a concise objective status log entry
     * @param {string} text Short message
     * @param {"info"|"online"|"loading"|"error"} type Status type
     */
    addLog(text, type = "info") {
      if (this.logs.length >= 4) {
        this.logs.shift();
      }
      this.logs.push({ text, type });
      this.renderLogs();
    }
    renderLogs() {
      var _a;
      const logBox = (_a = this.container) == null ? void 0 : _a.querySelector("#as-log-box");
      if (!logBox) return;
      if (this.logs.length === 0) {
        const initialText = this.isOnline ? "Server online at 127.0.0.1:20128" : "Server stopped (port 20128)";
        const initialType = this.isOnline ? "online" : "info";
        logBox.innerHTML = `
        <div class="as-log-line">
          <span class="as-log-dot ${initialType}"></span>
          <span class="as-log-text ${initialType}">${initialText}</span>
        </div>
      `;
        return;
      }
      logBox.innerHTML = this.logs.map(
        (l) => `
        <div class="as-log-line">
          <span class="as-log-dot ${l.type}"></span>
          <span class="as-log-text ${l.type}">${l.text}</span>
        </div>
      `
      ).join("");
      logBox.scrollTop = logBox.scrollHeight;
    }
    async refresh() {
      var _a, _b, _c, _d;
      const badge = (_a = this.container) == null ? void 0 : _a.querySelector("#as-status-badge");
      const ctaIconBox = (_b = this.container) == null ? void 0 : _b.querySelector("#as-cta-icon-box");
      const ctaTitle = (_c = this.container) == null ? void 0 : _c.querySelector("#as-cta-title");
      const ctaSub = (_d = this.container) == null ? void 0 : _d.querySelector("#as-cta-sub");
      if (!badge || !ctaTitle || !ctaSub || !ctaIconBox) return;
      if (this.isWorking) {
        badge.textContent = "STARTING";
        badge.className = "as-badge as-badge-loading";
        ctaIconBox.className = "as-cta-icon loading";
        ctaIconBox.innerHTML = SPINNER_SVG;
        ctaTitle.textContent = "Starting...";
        ctaSub.textContent = "Waiting for port 20128...";
        return;
      }
      this.isOnline = await routerService.isRunning();
      if (this.isOnline) {
        badge.textContent = "ONLINE";
        badge.className = "as-badge as-badge-online";
        ctaIconBox.className = "as-cta-icon running";
        ctaIconBox.innerHTML = STOP_SVG;
        ctaTitle.textContent = "Stop Server";
        ctaSub.textContent = "Running on 127.0.0.1:20128";
      } else {
        badge.textContent = "OFFLINE";
        badge.className = "as-badge as-badge-offline";
        ctaIconBox.className = "as-cta-icon";
        ctaIconBox.innerHTML = PLAY_SVG;
        ctaTitle.textContent = "Start 9Router";
        ctaSub.textContent = "Launch local server on port 20128";
      }
      if (this.logs.length === 0) {
        this.renderLogs();
      }
    }
    async handleStart() {
      var _a;
      if (this.isWorking) return;
      this.isWorking = true;
      this.refresh();
      const ctaSub = (_a = this.container) == null ? void 0 : _a.querySelector("#as-cta-sub");
      this.addLog("Launching 9Router daemon...", "loading");
      try {
        let loggedWaiting = false;
        await routerService.start((msg) => {
          if (ctaSub) ctaSub.textContent = msg;
          if (!loggedWaiting && msg.includes("Starting 9Router...")) {
            loggedWaiting = true;
            this.addLog("Waiting for port 20128...", "loading");
          }
        });
        this.addLog("9Router online at 127.0.0.1:20128", "online");
        toast("9Router started successfully!");
      } catch (err) {
        const errMsg = err.message ? err.message.split("\n")[0] : String(err);
        this.addLog(`Error: ${errMsg}`, "error");
        toast(`Failed to start: ${errMsg}`);
        logger.error("Start error:", err);
      } finally {
        this.isWorking = false;
        await this.refresh();
      }
    }
    async handleStop() {
      var _a, _b, _c;
      if (this.isWorking) return;
      this.isWorking = true;
      const ctaTitle = (_a = this.container) == null ? void 0 : _a.querySelector("#as-cta-title");
      const ctaSub = (_b = this.container) == null ? void 0 : _b.querySelector("#as-cta-sub");
      const ctaIconBox = (_c = this.container) == null ? void 0 : _c.querySelector("#as-cta-icon-box");
      if (ctaTitle) ctaTitle.textContent = "Stopping...";
      if (ctaSub) ctaSub.textContent = "Terminating 9Router process...";
      if (ctaIconBox) {
        ctaIconBox.className = "as-cta-icon loading";
        ctaIconBox.innerHTML = SPINNER_SVG;
      }
      this.addLog("Terminating process...", "loading");
      try {
        const stopped = await routerService.stop();
        if (!stopped) {
          throw new Error("Process did not respond to stop command.");
        }
        this.addLog("Server stopped.", "info");
        toast("9Router stopped.");
      } catch (err) {
        const errMsg = err.message || String(err);
        this.addLog(`Failed to stop: ${errMsg}`, "error");
        toast(`Failed to stop: ${errMsg}`);
        logger.error("Stop error:", err);
      } finally {
        this.isWorking = false;
        await this.refresh();
      }
    }
    openDashboard() {
      var _a;
      const url = "http://127.0.0.1:20128";
      if ((_a = window.system) == null ? void 0 : _a.openInBrowser) {
        window.system.openInBrowser(url);
      } else {
        window.open(url, "_blank");
      }
    }
  };

  // src/ui/styles.css
  var styles_default = '.acode-agent-sidebar-host {\n  --as-bg: var(--primary-color, #1b1e24);\n  --as-surface: var(--secondary-color, #121418);\n  --as-fg: var(--primary-text-color, #e8eaed);\n  --as-muted: var(--secondary-text-color, #8b919a);\n  --as-border: var(--border-color, #343941);\n  --as-accent: var(--active-color, #6aa4ff);\n  --as-button: var(--button-background, var(--as-accent));\n  --as-button-text: var(--button-text, #0c1118);\n  --as-danger: var(--error-text-color, #d46a6a);\n  --as-success: #2ecc71;\n  height: 100%;\n  min-height: 0;\n  background: var(--as-bg);\n  color: var(--as-fg);\n  font: inherit;\n}\n\n.acode-agent-sidebar-host *,\n.acode-agent-sidebar-host *::before,\n.acode-agent-sidebar-host *::after {\n  box-sizing: border-box;\n}\n\n.acode-agent-sidebar-host button,\n.acode-agent-sidebar-host input {\n  border: 0;\n  color: inherit;\n  font: inherit;\n}\n\n.acode-agent-sidebar-host button {\n  appearance: none;\n  -webkit-appearance: none;\n  background: transparent;\n  cursor: pointer;\n}\n\n.acode-agent-sidebar-host svg {\n  display: block;\n  flex: none;\n}\n\n.acode-agent-sidebar {\n  position: relative;\n  display: grid;\n  grid-template-rows: 48px minmax(0, 1fr);\n  height: 100%;\n  min-height: 0;\n  overflow: hidden;\n  background: var(--as-bg);\n}\n\n/* Header matching Acode AI Agent */\n.as-head {\n  display: grid;\n  grid-template-columns: 26px minmax(0, 1fr) auto;\n  align-items: center;\n  gap: 8px;\n  padding: 7px 9px;\n  border-bottom: 1px solid var(--as-border);\n}\n\n.as-mark {\n  display: grid;\n  place-items: center;\n  width: 26px;\n  height: 26px;\n  border-radius: 6px;\n  background: var(--as-button);\n  color: var(--as-button-text);\n  overflow: hidden;\n}\n\n.as-mark svg {\n  width: 17px;\n  height: 17px;\n}\n\n.as-head-info {\n  min-width: 0;\n  display: grid;\n  gap: 0;\n}\n\n.as-head b {\n  overflow: hidden;\n  font-size: 12px;\n  font-weight: 650;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.as-head-version {\n  overflow: hidden;\n  color: var(--as-muted);\n  font-size: 9.5px;\n  font-weight: 500;\n  letter-spacing: 0.02em;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.as-head-actions {\n  display: flex;\n  align-items: center;\n  gap: 2px;\n}\n\n/* Gear button styled in gray (--as-muted) matching Acode AI Agent */\n.as-icon-btn,\n#as-btn-settings {\n  display: grid;\n  place-items: center;\n  width: 28px;\n  height: 28px;\n  border-radius: 5px;\n  color: var(--as-muted) !important;\n  transition: all 0.15s ease;\n}\n\n.as-icon-btn:hover,\n#as-btn-settings:hover {\n  background: var(--as-surface);\n  color: var(--as-accent) !important;\n}\n\n.as-icon-btn svg,\n#as-btn-settings svg {\n  color: inherit;\n  stroke: currentColor;\n}\n\n.as-icon-btn:disabled {\n  opacity: 0.45;\n  cursor: default;\n}\n\n/* Scroll area */\n.as-scroll {\n  display: flex;\n  flex-direction: column;\n  min-height: 0;\n  max-height: 100%;\n  overflow-y: auto;\n  overflow-x: hidden;\n  overscroll-behavior: contain;\n  padding: 8px;\n}\n\n.as-scroll > * {\n  flex: none;\n}\n\n/* Primary CTA Button (matching as-create-project) */\n.as-create-project {\n  position: relative;\n  display: grid;\n  grid-template-columns: 32px minmax(0, 1fr);\n  align-items: center;\n  gap: 8px;\n  width: 100%;\n  min-height: 54px;\n  margin: 6px 0 10px 0;\n  padding: 7px 9px;\n  overflow: hidden;\n  border: 1px solid var(--as-border) !important;\n  border-radius: 9px;\n  background: var(--as-surface);\n  cursor: pointer;\n  text-align: left;\n  transition: background 0.15s ease, border-color 0.15s ease;\n}\n\n.as-create-project:hover {\n  border-color: var(--as-accent) !important;\n}\n\n.as-create-project::after {\n  content: "";\n  position: absolute;\n  right: -25px;\n  bottom: -42px;\n  width: 84px;\n  height: 84px;\n  border: 1px solid var(--as-border);\n  border-radius: 50%;\n  pointer-events: none;\n}\n\n.as-cta-icon {\n  display: grid;\n  place-items: center;\n  width: 32px;\n  height: 32px;\n  border-radius: 7px;\n  background: var(--as-button);\n  color: var(--as-button-text);\n  transition: background 0.2s ease, color 0.2s ease;\n}\n\n.as-cta-icon.running {\n  background: #e74c3c;\n  color: #ffffff;\n}\n\n.as-cta-icon.loading {\n  background: #f1c40f;\n  color: #121418;\n}\n\n.as-create-project > span:last-child {\n  min-width: 0;\n  display: grid;\n  gap: 1px;\n}\n\n.as-create-project b {\n  overflow: hidden;\n  font-size: 11px;\n  font-weight: 650;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.as-create-project small {\n  overflow: hidden;\n  color: var(--as-muted);\n  font-size: 9px;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n/* Sections */\n.as-section {\n  border-bottom: 1px solid var(--as-border);\n  padding-bottom: 6px;\n  margin-bottom: 6px;\n}\n\n.as-section:last-child {\n  border-bottom: none;\n}\n\n.as-section-toggle {\n  display: grid;\n  grid-template-columns: 16px minmax(0, 1fr) auto;\n  align-items: center;\n  gap: 4px;\n  width: 100%;\n  min-height: 32px;\n  padding: 0 3px;\n  background: transparent;\n  color: var(--as-muted);\n  cursor: pointer;\n  text-align: left;\n}\n\n.as-section-toggle > span {\n  font-size: 10px;\n  font-weight: 650;\n  letter-spacing: 0.08em;\n  text-transform: uppercase;\n}\n\n.as-chevron {\n  transform: rotate(-90deg);\n  transition: transform 0.16s ease;\n}\n\n.as-section.expanded .as-chevron {\n  transform: rotate(0);\n}\n\n.as-section-content {\n  display: none;\n  padding: 4px 2px;\n}\n\n.as-section.expanded .as-section-content {\n  display: block;\n}\n\n/* Badges */\n.as-badge {\n  padding: 1px 6px;\n  border-radius: 999px;\n  font-size: 8.5px;\n  font-weight: 700;\n  letter-spacing: 0.4px;\n  text-transform: uppercase;\n}\n\n.as-badge-online {\n  background: rgba(46, 204, 113, 0.2);\n  color: #2ecc71;\n}\n\n.as-badge-offline {\n  background: var(--as-surface);\n  color: var(--as-muted);\n}\n\n.as-badge-loading {\n  background: rgba(241, 196, 15, 0.2);\n  color: #f1c40f;\n}\n\n/* Compact Log Box for Service Status */\n.as-log-box {\n  display: flex;\n  flex-direction: column;\n  gap: 4px;\n  padding: 7px 8px;\n  background: var(--as-surface);\n  border: 1px solid var(--as-border);\n  border-radius: 6px;\n  min-height: 48px;\n  max-height: 88px;\n  overflow-y: auto;\n  overflow-x: hidden;\n}\n\n.as-log-line {\n  display: flex;\n  align-items: flex-start;\n  gap: 6px;\n  font-size: 9.5px;\n  line-height: 1.35;\n  word-break: break-word;\n}\n\n.as-log-dot {\n  flex: none;\n  width: 5px;\n  height: 5px;\n  border-radius: 50%;\n  background: var(--as-muted);\n  margin-top: 4px;\n}\n\n.as-log-dot.online {\n  background: var(--as-success);\n}\n\n.as-log-dot.loading {\n  background: #f1c40f;\n}\n\n.as-log-dot.error {\n  background: var(--as-danger);\n}\n\n.as-log-text {\n  flex: 1;\n  color: var(--as-muted);\n}\n\n.as-log-text.online {\n  color: var(--as-fg);\n}\n\n.as-log-text.loading {\n  color: var(--as-fg);\n}\n\n.as-log-text.error {\n  color: var(--as-danger);\n}\n\n/* Animations */\n.as-spin {\n  animation: as-spin 0.85s linear infinite;\n}\n\n@keyframes as-spin {\n  to {\n    transform: rotate(1turn);\n  }\n}\n\n/* Onboarding & Preparation View (matching acode-opencode style) */\n.as-onboarding-container {\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  justify-content: center;\n  flex: 1;\n  width: 100%;\n  padding: 32px 16px;\n  box-sizing: border-box;\n  text-align: center;\n}\n\n.as-spinner-ring {\n  width: 44px;\n  height: 44px;\n  border-radius: 50%;\n  background: conic-gradient(from 0deg, var(--as-accent, #6aa4ff) 0% 75%, transparent 75% 100%);\n  -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 4.5px), #fff calc(100% - 4.5px));\n  mask: radial-gradient(farthest-side, transparent calc(100% - 4.5px), #fff calc(100% - 4.5px));\n}\n\n.as-spinner-label {\n  margin: 18px 0 0 0;\n  color: var(--as-fg, #e8eaed);\n  font-size: 13px;\n  font-weight: 600;\n  line-height: 1.4;\n}\n\n.as-spinner-progress {\n  margin: 10px 0 0 0;\n  color: var(--as-muted, #8b919a);\n  font-size: 10px;\n  font-family: monospace;\n  white-space: pre-wrap;\n  word-break: break-all;\n  max-width: 100%;\n  text-align: center;\n  max-height: 52px;\n  overflow: hidden;\n  line-height: 1.35;\n  padding: 0 4px;\n  box-sizing: border-box;\n}\n\n/* Error view inside Onboarding */\n.as-onboarding-error {\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  justify-content: center;\n  flex: 1;\n  padding: 24px 16px;\n  text-align: center;\n  gap: 10px;\n  box-sizing: border-box;\n}\n\n.as-error-badge {\n  display: grid;\n  place-items: center;\n  width: 42px;\n  height: 42px;\n  border-radius: 50%;\n  background: rgba(212, 106, 106, 0.15);\n  color: var(--as-danger, #d46a6a);\n  font-size: 20px;\n}\n\n.as-error-title {\n  font-size: 13px;\n  font-weight: 650;\n  color: var(--as-fg);\n  margin: 0;\n}\n\n.as-error-desc {\n  font-size: 10.5px;\n  color: var(--as-muted);\n  line-height: 1.4;\n  margin: 0;\n}\n\n.as-error-log {\n  max-height: 80px;\n  width: 100%;\n  overflow-y: auto;\n  background: var(--as-surface);\n  border: 1px solid var(--as-border);\n  border-radius: 6px;\n  padding: 6px 8px;\n  font-size: 9.5px;\n  font-family: monospace;\n  color: var(--as-danger);\n  text-align: left;\n  white-space: pre-wrap;\n  word-break: break-word;\n  box-sizing: border-box;\n}\n\n.as-btn-retry {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  padding: 7px 18px;\n  border-radius: 6px;\n  background: var(--as-button);\n  color: var(--as-button-text);\n  font-size: 11px;\n  font-weight: 600;\n  cursor: pointer;\n  margin-top: 6px;\n  transition: opacity 0.15s ease;\n}\n\n.as-btn-retry:hover {\n  opacity: 0.85;\n}\n\n';

  // plugin.json
  var plugin_default = {
    $schema: "https://acode.app/schema/plugin/v0.1.0.json",
    id: "acode.9router",
    name: "Acode 9Router",
    main: "dist/main.js",
    version: "1.0.0",
    icon: "icon.png",
    readme: "readme.md",
    changelogs: "changelogs.md",
    repository: "https://github.com/Neon-MC/acode-9router",
    minVersionCode: 290,
    license: "MIT",
    keywords: [
      "ai",
      "9router",
      "llm",
      "fallback",
      "agent",
      "proxy"
    ],
    price: 0,
    author: {
      name: "Neon-MC",
      github: "Neon-MC"
    },
    contributors: [
      {
        name: "Neon-MC",
        github: "Neon-MC",
        role: "Creator & Lead Developer"
      },
      {
        name: "Antigravity",
        github: "google-antigravity",
        role: "AI Pair Programmer"
      }
    ]
  };

  // src/main.js
  var SIDEBAR_ID = "acode.9router.sidebar";
  var NineRouterBridgePlugin = class {
    constructor() {
      this.sidebarApp = new SidebarApp();
      this.styleElement = null;
      this.sidebarAppsApi = null;
    }
    async init(baseUrl, $page, options) {
      logger.info("Initializing 9Router Bridge plugin...");
      this.injectStyles();
      installIcon();
      this.registerSidebar();
      this.registerCommands();
      logger.info("9Router Bridge initialized successfully.");
    }
    injectStyles() {
      const styleId = "acode-9router-bridge-styles";
      if (document.getElementById(styleId)) return;
      this.styleElement = document.createElement("style");
      this.styleElement.id = styleId;
      this.styleElement.textContent = styles_default;
      document.head.appendChild(this.styleElement);
    }
    registerSidebar() {
      var _a, _b;
      const sidebarApps = (_b = (_a = window.acode) == null ? void 0 : _a.require) == null ? void 0 : _b.call(_a, "sidebarApps");
      if (!sidebarApps) {
        logger.warn("Acode sidebarApps API unavailable. Skipping sidebar registration.");
        return;
      }
      this.sidebarAppsApi = sidebarApps;
      try {
        sidebarApps.add(
          ICON_CLASS,
          SIDEBAR_ID,
          "9Router",
          (container) => {
            this.sidebarApp.mount(container);
          },
          false,
          // Append to end of sidebar icons
          () => {
            this.sidebarApp.refresh();
          }
        );
        logger.info("Sidebar app registered with ID:", SIDEBAR_ID);
      } catch (err) {
        logger.error("Failed to register sidebar app:", err);
      }
    }
    registerCommands() {
      var _a;
      if ((_a = window.acode) == null ? void 0 : _a.addCommand) {
        window.acode.addCommand({
          name: "Acode 9Router: Start Server",
          description: "Start the local 9Router proxy server",
          exec: async () => {
            await routerService.start();
            this.sidebarApp.refresh();
          }
        });
        window.acode.addCommand({
          name: "Acode 9Router: Stop Server",
          description: "Stop the 9Router server",
          exec: async () => {
            await routerService.stop();
            this.sidebarApp.refresh();
          }
        });
        window.acode.addCommand({
          name: "Acode 9Router: Open Dashboard",
          description: "Open the 9Router web dashboard in browser",
          exec: () => {
            this.sidebarApp.openDashboard();
          }
        });
      }
    }
    async destroy() {
      logger.info("Destroying 9Router Bridge plugin...");
      if (this.sidebarAppsApi) {
        try {
          this.sidebarAppsApi.remove(SIDEBAR_ID);
        } catch (e) {
        }
        this.sidebarAppsApi = null;
      }
      if (this.styleElement && this.styleElement.parentNode) {
        this.styleElement.parentNode.removeChild(this.styleElement);
        this.styleElement = null;
      }
      logger.info("9Router Bridge destroyed.");
    }
  };
  var instance = new NineRouterBridgePlugin();
  if (window.acode) {
    window.acode.setPluginInit(
      plugin_default.id,
      async (baseUrl, $page, options) => {
        await instance.init(baseUrl, $page, options);
      }
    );
    window.acode.setPluginUnmount(plugin_default.id, () => {
      instance.destroy();
    });
  }
  var main_default = instance;
})();
