import { routerService } from "../bridge/9router-service.js";
import { installerService } from "../installer/installer-service.js";
import { createSpinner } from "./spinner.js";
import { ROUTER_SVG } from "./icons.js";
import { logger } from "../utils/logger.js";

function toast(msg) {
  if (window.toast) {
    window.toast(msg);
  } else {
    console.log("[Toast]", msg);
  }
}

const GEAR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
  <circle cx="12" cy="12" r="3"/>
</svg>`;

const PLAY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
  <polygon points="6 3 20 12 6 21 6 3"/>
</svg>`;

const STOP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
  <rect x="4" y="4" width="16" height="16" rx="2"/>
</svg>`;

const SPINNER_SVG = `<svg class="as-spin" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
  <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
</svg>`;

const CHEVRON_SVG = `<svg class="as-chevron" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <polyline points="6 9 12 15 18 9"/>
</svg>`;

export class SidebarApp {
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

    // Check if 9Router environment is ready
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

    // Gear button opens 9Router web config in browser
    const btnSettings = this.container.querySelector("#as-btn-settings");
    btnSettings?.addEventListener("click", () => this.openDashboard());
  }

  /**
   * Run the automated installation flow with animated spinner and live output streaming
   */
  async startInstallFlow() {
    const bodyHost = this.container?.querySelector("#as-body-host");
    if (!bodyHost) return;

    bodyHost.innerHTML = "";
    this.spinner = createSpinner("Checking environment...");
    bodyHost.appendChild(this.spinner.element);

    try {
      await installerService.install(
        (status) => this.spinner?.setStatus(status),
        (progress) => this.spinner?.setProgress(progress)
      );

      this.spinner?.setStatus("Environment ready!");
      this.spinner?.setProgress("");

      // Brief pause to display completion before transition
      await new Promise((r) => setTimeout(r, 900));

      this.spinner?.stop();
      this.spinner = null;

      this.addLog("Environment ready.", "online");
      this.addLog("Ready to start on port 20128.", "info");

      this.renderMainView();
      await this.refresh();
    } catch (err) {
      logger.error("Automated installation error:", err);
      this.spinner?.stop();
      this.spinner = null;
      this.renderInstallError(err);
    }
  }

  renderInstallError(err) {
    const bodyHost = this.container?.querySelector("#as-body-host");
    if (!bodyHost) return;

    const errMsg = err?.message || String(err);
    bodyHost.innerHTML = `
      <div class="as-onboarding-error">
        <div class="as-error-badge">⚠️</div>
        <b class="as-error-title">Setup Failed</b>
        <p class="as-error-desc">Unable to download or prepare 9Router. Please check your internet connection and try again.</p>
        <div class="as-error-log">${errMsg}</div>
        <button type="button" class="as-btn-retry" id="as-btn-retry">Try Again</button>
      </div>
    `;

    const btnRetry = bodyHost.querySelector("#as-btn-retry");
    btnRetry?.addEventListener("click", () => {
      this.startInstallFlow();
    });
  }

  renderMainView() {
    const bodyHost = this.container?.querySelector("#as-body-host");
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
    const btnToggle = this.container?.querySelector("#as-btn-toggle");

    btnToggle?.addEventListener("click", () => {
      if (this.isOnline) {
        this.handleStop();
      } else {
        this.handleStart();
      }
    });

    // Collapsible section toggles
    const toggles = this.container?.querySelectorAll(".as-section-toggle") || [];
    toggles.forEach((btn) => {
      btn.addEventListener("click", () => {
        const secId = btn.getAttribute("data-sec");
        const sec = this.container?.querySelector(`#${secId}`);
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
    const logBox = this.container?.querySelector("#as-log-box");
    if (!logBox) return;

    if (this.logs.length === 0) {
      const initialText = this.isOnline
        ? "Server online at 127.0.0.1:20128"
        : "Server stopped (port 20128)";
      const initialType = this.isOnline ? "online" : "info";
      logBox.innerHTML = `
        <div class="as-log-line">
          <span class="as-log-dot ${initialType}"></span>
          <span class="as-log-text ${initialType}">${initialText}</span>
        </div>
      `;
      return;
    }

    logBox.innerHTML = this.logs
      .map(
        (l) => `
        <div class="as-log-line">
          <span class="as-log-dot ${l.type}"></span>
          <span class="as-log-text ${l.type}">${l.text}</span>
        </div>
      `
      )
      .join("");

    logBox.scrollTop = logBox.scrollHeight;
  }

  async refresh() {
    const badge = this.container?.querySelector("#as-status-badge");
    const ctaIconBox = this.container?.querySelector("#as-cta-icon-box");
    const ctaTitle = this.container?.querySelector("#as-cta-title");
    const ctaSub = this.container?.querySelector("#as-cta-sub");

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
    if (this.isWorking) return;
    this.isWorking = true;
    this.refresh();

    const ctaSub = this.container?.querySelector("#as-cta-sub");
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
    if (this.isWorking) return;
    this.isWorking = true;

    const ctaTitle = this.container?.querySelector("#as-cta-title");
    const ctaSub = this.container?.querySelector("#as-cta-sub");
    const ctaIconBox = this.container?.querySelector("#as-cta-icon-box");

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
    const url = "http://127.0.0.1:20128";
    if (window.system?.openInBrowser) {
      window.system.openInBrowser(url);
    } else {
      window.open(url, "_blank");
    }
  }
}
