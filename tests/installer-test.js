import assert from "assert";
import { execSync } from "child_process";
import fs from "fs";

// Mock global window and Executor matching Acode environment
global.window = {
  Executor: {
    execute: async (cmd, alpine) => {
      // Direct command execution matching Acode's proot execution behavior
      try {
        const out = execSync(cmd, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
        return out;
      } catch (err) {
        const error = new Error(`Command exited with code: ${err.status}`);
        error.status = err.status;
        error.output = err.stderr ? err.stderr.toString() : "";
        throw error;
      }
    },
    BackgroundExecutor: {
      start: async (cmd, callback, alpine) => {
        try {
          const out = execSync(cmd, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
          callback("stdout", out);
          callback("exit", "0");
          return "test-uuid-123";
        } catch (err) {
          callback("stderr", err.message);
          callback("exit", String(err.status || 1));
          return "test-uuid-failed";
        }
      },
      stop: async (uuid) => "stopped",
      isRunning: async (uuid) => false,
    },
  },
};

async function testInstaller() {
  console.log("=== TESTING INSTALLER & ENVIRONMENT SERVICE ===\n");

  const { installerService } = await import("../src/installer/installer-service.js");

  // 1. Test isInstalled in current environment (should be true)
  console.log("[1/3] Testing installerService.isInstalled() in configured environment...");
  const isInstalled = await installerService.isInstalled();
  assert.strictEqual(isInstalled, true, "isInstalled() must return true in configured environment");
  console.log(" -> [PASS] isInstalled() returned true cleanly without unhandled exceptions.\n");

  // 2. Test configureEnvironment
  console.log("[2/3] Testing installerService.configureEnvironment()...");
  await installerService.configureEnvironment();
  assert.ok(fs.existsSync("/public/.9router/db/data.sqlite"), "data.sqlite must exist");
  assert.ok(fs.existsSync("/public/.9router/stop.sh"), "stop.sh must exist");
  assert.ok(fs.existsSync("/public/.9router/.installed"), ".installed must exist");
  console.log(" -> [PASS] configureEnvironment() executed successfully, creating database and stop.sh.\n");

  // 3. Test simulated missing binary
  console.log("[3/3] Testing behavior when binary is missing...");
  const origExecute = global.window.Executor.execute;
  global.window.Executor.execute = async (cmd) => {
    if (cmd.includes("which 9router")) {
      const err = new Error("Command exited with code: 1");
      err.status = 1;
      throw err;
    }
    return origExecute(cmd);
  };

  const missingResult = await installerService.isInstalled();
  assert.strictEqual(missingResult, false, "isInstalled() must catch rejection and return false");
  console.log(" -> [PASS] isInstalled() safely handled missing binary error and returned false.\n");

  global.window.Executor.execute = origExecute;

  console.log("=====================================================");
  console.log("  ALL INSTALLER TESTS PASSED SUCCESSFULLY!");
  console.log("=====================================================");
}

testInstaller().catch((err) => {
  console.error("TEST FAILED:", err);
  process.exit(1);
});
