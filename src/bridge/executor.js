import { logger } from "../utils/logger.js";

function getExecutor() {
  return typeof window !== "undefined" ? window.Executor : null;
}

/**
 * Execute a shell command inside Alpine proot and resolve with its stdout.
 *
 * @param {string} command - Shell command to execute
 * @param {boolean} [alpine=true] - Whether to execute inside Alpine Linux
 * @returns {Promise<string>}
 */
export async function execute(command, alpine = true) {
  const executor = getExecutor();
  if (!executor?.execute) {
    throw new Error("Acode Executor not available. Please run inside Acode with Alpine terminal.");
  }
  return executor.execute(command, alpine);
}

/**
 * Launch a command and stream stdout/stderr lines in real-time via onProgress.
 * Resolves with full accumulated stdout on exit 0, or rejects on non-zero exit code.
 *
 * @param {string} command - Shell command to execute
 * @param {Function} [onProgress] - Callback receiving the latest line emitted
 * @param {boolean} [alpine=true] - Whether to run in Alpine proot
 * @returns {Promise<string>}
 */
export async function executeVerbose(command, onProgress, alpine = true) {
  logger.info(`executeVerbose: launching "${command}"`);
  const executor = getExecutor();

  if (executor?.BackgroundExecutor?.start) {
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
              const lines = data
                .split("\n")
                .map((l) => l.trim())
                .filter(Boolean);
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
                  `Command failed with code ${exitCode}.\nOutput:\n${stdout}`
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

  // Fallback to standard blocking execute if BackgroundExecutor is absent
  return execute(command, alpine);
}
