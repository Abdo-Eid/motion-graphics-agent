/**
 * Smoke test — verifies the Azure OpenAI wire is live before any T1 code lands.
 *
 * Run from repo root:
 *   bun run mastra/smoke.ts
 *
 * Uses @ai-sdk/azure (the purpose-built Azure provider). It bakes in the
 * correct URL shape, auth header, and api-version handling — no custom
 * fetch wrapper, no baseURL string surgery.
 */

import { Agent } from "@mastra/core/agent";
import { createAzure } from "@ai-sdk/azure";
import { embed } from "ai";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    throw new Error(`Missing or empty env var: ${name}`);
  }
  return v;
}

const AZURE_RESOURCE_NAME = requireEnv("AZURE_RESOURCE_NAME");
const AZURE_API_KEY = requireEnv("AZURE_API_KEY");
const AZURE_API_VERSION = requireEnv("AZURE_API_VERSION");
const AZURE_CHAT_DEPLOYMENT = requireEnv("AZURE_CHAT_DEPLOYMENT");

console.log("env ok");
console.log("  resource:", AZURE_RESOURCE_NAME);
console.log("  deployment:", AZURE_CHAT_DEPLOYMENT);
console.log("  api-version:", AZURE_API_VERSION);

const azure = createAzure({
  resourceName: AZURE_RESOURCE_NAME,
  apiKey: AZURE_API_KEY,
  apiVersion: AZURE_API_VERSION,
});

const agent = new Agent({
  id: "smoke",
  name: "smoke",
  instructions: "Reply with exactly the word: pong",
  model: azure(AZURE_CHAT_DEPLOYMENT),
});

const t0 = Date.now();
const result = await agent.generate("ping");
const ms = Date.now() - t0;

const text = result.text?.trim() ?? "";
if (!text) {
  console.error("FAIL: empty response");
  process.exit(1);
}

console.log(`reply (${ms}ms):`, text);

// --- Embedding check (T1B prereq) -----------------------------------------
const AZURE_EMBEDDING_DEPLOYMENT = requireEnv("AZURE_EMBEDDING_DEPLOYMENT");
console.log("");
console.log("embedding deployment:", AZURE_EMBEDDING_DEPLOYMENT);

const t1 = Date.now();
const { embedding } = await embed({
  model: azure.embedding(AZURE_EMBEDDING_DEPLOYMENT),
  value: "smoke test embedding input",
});
const ems = Date.now() - t1;

if (!Array.isArray(embedding) || embedding.length === 0) {
  console.error("FAIL: empty embedding vector");
  process.exit(1);
}

console.log(`vector (${ems}ms): dim=${embedding.length}, sample=[${embedding.slice(0, 3).map((n) => n.toFixed(4)).join(", ")}, ...]`);
console.log("PASS");
