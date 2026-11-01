import { logger } from "../utils/logger.js";
import { httpClient } from "./http-client.js";

const DATA_DIR = "/public/.9router";
const SERVER_JS = "/usr/local/lib/node_modules/9router/app/custom-server.js";
const RUNTIME_DIR = "/public/.9router/runtime/node_modules";
const LOG_FILE = `${DATA_DIR}/server.log`;
const STOP_SCRIPT = `${DATA_DIR}/stop.sh`;
const BG_UUID_KEY = "acode_9router_bg_uuid";

// Command executed directly as a background daemon in Alpine Linux
export const SERVER_COMMAND = `env PORT=20128 HOSTNAME=127.0.0.1 DATA_DIR=${DATA_DIR} NODE_PATH=${RUNTIME_DIR} node ${SERVER_JS}`;

const READY_TIMEOUT = 30000; // 30s timeout matching mobile cold start
const POLL_INTERVAL = 1000;

function getExecutor() {
  return window?.Executor;
}

export const routerService = {
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
    if (this.isStarting) return false;

    // If already running, return true immediately
    if (await this.isRunning()) {
      logger.info("9Router is already running.");
      return true;
    }

    this.isStarting = true;
    try {
      const executor = getExecutor();
      if (!executor) {
        throw new Error("Acode Executor not available. Please run inside Acode with Alpine terminal installed.");
      }

      onProgress?.("Preparing port 20128...");

      // 1. Clean up any stale process
      try {
        if (executor.execute) {
          await executor.execute(`sh ${STOP_SCRIPT}`, true).catch(() => {});
          await executor.execute("pkill -f custom-server.js", true).catch(() => {});
        }
      } catch (e) {
        logger.debug("Cleanup notice:", e);
      }

      onProgress?.("Starting 9Router server in Alpine...");
      logger.info(`Launching daemon: ${SERVER_COMMAND}`);

      // 2. Launch server as persistent background process
      if (executor.BackgroundExecutor?.start) {
        this.backgroundUuid = await executor.BackgroundExecutor.start(
          SERVER_COMMAND,
          (type, data) => {
            logger.debug(`[9Router ${type}]`, data);
            if (type === "stdout" || type === "stderr") {
              const lines = data.split("\n").filter(Boolean);
              const lastLine = lines.pop();
              if (lastLine) {
                const trimmed = lastLine.trim();
                // Filter out container noise lines
                if (!trimmed.startsWith("proot warning:")) {
                  onProgress?.(trimmed);
                }
              }
            }
          },
          true // Run inside Alpine
        );

        if (this.backgroundUuid) {
          try {
            localStorage.setItem(BG_UUID_KEY, this.backgroundUuid);
          } catch {}
        }
        logger.info(`9Router background task started, uuid=${this.backgroundUuid}`);
      } else if (executor.execute) {
        // Fallback: nohup background launch
        const nohupCmd = `nohup ${SERVER_COMMAND} > ${LOG_FILE} 2>&1 < /dev/null &`;
        logger.info(`Fallback launch via execute: ${nohupCmd}`);
        await executor.execute(nohupCmd, true);
      } else {
        throw new Error("No execution mechanism found in Executor.");
      }

      // 3. Poll for readiness (up to 30s)
      const startedAt = Date.now();
      while (Date.now() - startedAt < READY_TIMEOUT) {
        const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
        onProgress?.(`Starting 9Router... (${elapsedSec}s/30s)`);

        const online = await this.isRunning();
        if (online) {
          logger.info(`9Router is online after ${elapsedSec}s!`);
          return true;
        }

        await new Promise((r) => setTimeout(r, POLL_INTERVAL));
      }

      // If timed out, gather recent log snippet for diagnostics
      const logSnippet = await this.getLogs(15);
      throw new Error(
        `9Router started, but port 20128 did not respond within 30 seconds.\n` +
        `Recent logs:\n${logSnippet}`
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
    if (this.isStopping) return false;
    this.isStopping = true;
    try {
      const executor = getExecutor();
      onProgress?.("Stopping 9Router...");

      // 1. Stop background task UUID if tracked (memory or persisted)
      const uuid =
        this.backgroundUuid ||
        (typeof localStorage !== "undefined"
          ? localStorage.getItem(BG_UUID_KEY)
          : null);

      if (uuid && executor?.BackgroundExecutor?.stop) {
        try {
          await executor.BackgroundExecutor.stop(uuid);
        } catch (e) {
          logger.debug("BackgroundExecutor.stop notice:", e);
        }
      }
      this.backgroundUuid = null;
      try {
        localStorage.removeItem(BG_UUID_KEY);
      } catch {}

      // 2. Execute dedicated stop script and pkill to ensure process terminated
      if (executor?.execute) {
        try {
          await executor.execute(`sh ${STOP_SCRIPT}`, true).catch(() => {});
        } catch (e) {
          logger.warn("Stop script notice:", e);
        }
        try {
          await executor.execute("pkill -15 -f custom-server.js", true).catch(() => {});
        } catch {}
      }

      // 3. Verify port release
      for (let i = 0; i < 8; i++) {
        await new Promise((r) => setTimeout(r, 400));
        const running = await this.isRunning();
        if (!running) {
          logger.info("9Router confirmed stopped.");
          return true;
        }
      }

      // 4. Fallback aggressive cleanup if still responding
      if (await this.isRunning() && executor?.execute) {
        try {
          await executor.execute("pkill -9 -f custom-server.js", true).catch(() => {});
          await executor.execute(`rm -f ${DATA_DIR}/server.pid`, true).catch(() => {});
        } catch {}
        await new Promise((r) => setTimeout(r, 500));
      }

      const stopped = !(await this.isRunning());
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
    const executor = getExecutor();
    if (!executor?.execute) {
      return "(Executor not available to read logs)";
    }
    try {
      const output = await executor.execute(`tail -n ${lines} ${LOG_FILE}`, true);
      return output || "(No logs recorded yet)";
    } catch {
      return "(No logs recorded yet)";
    }
  },
};
