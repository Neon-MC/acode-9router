import assert from "assert";
import fs from "fs";

const BASE_URL = "http://127.0.0.1:20128";

async function runTests() {
  console.log("=== RUNNING TEST SUITE — 9ROUTER BRIDGE FOR ACODE ===\n");

  // 1. Health check
  console.log("[1/3] Testing health endpoint GET /api/health...");
  const healthRes = await fetch(`${BASE_URL}/api/health`);
  assert.strictEqual(healthRes.status, 200, "Health check status must be 200");
  const healthData = await healthRes.json();
  assert.strictEqual(healthData.ok, true, "Health check ok must be true");
  console.log(" -> [PASS] 9Router is healthy and responding on port 20128.\n");

  // 2. Models catalog
  console.log("[2/3] Testing OpenAI catalog GET /v1/models...");
  const modelsRes = await fetch(`${BASE_URL}/v1/models`);
  assert.strictEqual(modelsRes.status, 200, "Models status must be 200");
  const modelsData = await modelsRes.json();
  assert.ok(Array.isArray(modelsData.data), "Models catalog must contain data array");
  console.log(` -> [PASS] /v1/models responding properly (${modelsData.data.length} models).\n`);

  // 3. Verification of ZIP artifact
  console.log("[3/3] Verifying acode-9router.zip integrity...");
  assert.ok(fs.existsSync("/public/9Router-Acode/acode-9router.zip"), "acode-9router.zip must exist");
  const stat = fs.statSync("/public/9Router-Acode/acode-9router.zip");
  assert.ok(stat.size > 10000, "Zip size must exceed 10KB");
  console.log(` -> [PASS] Package artifact verified (${(stat.size / 1024).toFixed(1)} KB).\n`);

  console.log("=====================================================");
  console.log("  ALL SUITE TESTS COMPLETED SUCCESSFULLY!");
  console.log("=====================================================");
}

runTests().catch((err) => {
  console.error("TEST FAILED:", err);
  process.exit(1);
});
