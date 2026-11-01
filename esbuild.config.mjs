import * as esbuild from "esbuild";
import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function packZip() {
  try {
    const out = execSync("node .vscode/pack-zip.js", { cwd: __dirname, encoding: "utf-8" });
    if (out) console.log(out.trim());
  } catch (err) {
    console.error("[Build] Error packing zip:", err);
    process.exit(1);
  }
}

const buildPlugin = {
  name: "pack-zip-plugin",
  setup(build) {
    build.onEnd((result) => {
      if (result.errors.length === 0) {
        console.log("[Build] JS bundle created successfully.");
        packZip();
      }
    });
  },
};

esbuild
  .build({
    entryPoints: [path.join(__dirname, "src", "main.js")],
    bundle: true,
    outfile: path.join(__dirname, "dist", "main.js"),
    format: "iife",
    platform: "browser",
    target: ["es2020", "chrome80"],
    sourcemap: false,
    loader: {
      ".css": "text",
      ".svg": "text",
    },
    plugins: [buildPlugin],
  })
  .catch((err) => {
    console.error("[Build] Failed:", err);
    process.exit(1);
  });
