import { ICON_CLASS, installIcon } from "./ui/icons.js";
import { SidebarApp } from "./ui/sidebar.js";
import { routerService } from "./bridge/9router-service.js";
import { logger } from "./utils/logger.js";
import styles from "./ui/styles.css";
import pluginPkg from "../plugin.json";

const SIDEBAR_ID = "acode.9router.sidebar";

class NineRouterBridgePlugin {
  constructor() {
    this.sidebarApp = new SidebarApp();
    this.styleElement = null;
    this.sidebarAppsApi = null;
  }

  async init(baseUrl, $page, options) {
    logger.info("Initializing 9Router Bridge plugin...");

    // 1. Inject Styles
    this.injectStyles();

    // 2. Install Icon
    installIcon();

    // 3. Register Sidebar App
    this.registerSidebar();

    // 4. Register Command Palette actions
    this.registerCommands();

    logger.info("9Router Bridge initialized successfully.");
  }

  injectStyles() {
    const styleId = "acode-9router-bridge-styles";
    if (document.getElementById(styleId)) return;

    this.styleElement = document.createElement("style");
    this.styleElement.id = styleId;
    this.styleElement.textContent = styles;
    document.head.appendChild(this.styleElement);
  }

  registerSidebar() {
    const sidebarApps = window.acode?.require?.("sidebarApps");
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
        false, // Append to end of sidebar icons
        () => {
          // Called whenever tab is selected
          this.sidebarApp.refresh();
        }
      );
      logger.info("Sidebar app registered with ID:", SIDEBAR_ID);
    } catch (err) {
      logger.error("Failed to register sidebar app:", err);
    }
  }

  registerCommands() {
    // Acode global command palette actions
    if (window.acode?.addCommand) {
      window.acode.addCommand({
        name: "Acode 9Router: Start Server",
        description: "Start the local 9Router proxy server",
        exec: async () => {
          await routerService.start();
          this.sidebarApp.refresh();
        },
      });

      window.acode.addCommand({
        name: "Acode 9Router: Stop Server",
        description: "Stop the 9Router server",
        exec: async () => {
          await routerService.stop();
          this.sidebarApp.refresh();
        },
      });

      window.acode.addCommand({
        name: "Acode 9Router: Open Dashboard",
        description: "Open the 9Router web dashboard in browser",
        exec: () => {
          this.sidebarApp.openDashboard();
        },
      });
    }
  }

  async destroy() {
    logger.info("Destroying 9Router Bridge plugin...");

    // Remove sidebar app
    if (this.sidebarAppsApi) {
      try {
        this.sidebarAppsApi.remove(SIDEBAR_ID);
      } catch (e) {}
      this.sidebarAppsApi = null;
    }

    // Remove styles
    if (this.styleElement && this.styleElement.parentNode) {
      this.styleElement.parentNode.removeChild(this.styleElement);
      this.styleElement = null;
    }

    logger.info("9Router Bridge destroyed.");
  }
}

const instance = new NineRouterBridgePlugin();

if (window.acode) {
  window.acode.setPluginInit(
    pluginPkg.id,
    async (baseUrl, $page, options) => {
      await instance.init(baseUrl, $page, options);
    }
  );

  window.acode.setPluginUnmount(pluginPkg.id, () => {
    instance.destroy();
  });
}

export default instance;
