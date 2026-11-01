import { logger } from "../utils/logger.js";

const DEFAULT_BASE_URL = "http://127.0.0.1:20128";

function getCordovaHttp() {
  return window?.cordova?.plugin?.http;
}

function getExecutor() {
  return window?.Executor;
}

export const httpClient = {
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
    // 1. Alpine terminal curl check (direct, reliable within proot)
    const executor = getExecutor();
    if (executor?.execute) {
      try {
        const out = await executor.execute(
          `curl -s -m 2 ${this.baseUrl}/api/health`,
          true
        );
        if (typeof out === "string" && out.includes('"ok":true')) {
          return true;
        }
      } catch {
        // Fall through to Cordova HTTP check
      }
    }

    // 2. Cordova Advanced HTTP check (native mobile network stack)
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
            { method: "GET", timeout: Math.max(1, Math.floor(timeoutMs / 1000)) },
            () => {
              clearTimeout(timer);
              settle(true);
            },
            (error) => {
              clearTimeout(timer);
              const status = typeof error?.status === "number" ? error.status : 0;
              // If status > 0 (e.g. 404, 500), the server answered on the port
              settle(status > 0);
            }
          );
        } catch {
          clearTimeout(timer);
          settle(false);
        }
      });
    }

    // 3. Fallback for browser / standard Fetch environments
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(`${this.baseUrl}/api/health`, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      clearTimeout(timer);
      const data = await res.json().catch(() => null);
      return res.ok && data?.ok === true;
    } catch {
      return false;
    }
  },
};
