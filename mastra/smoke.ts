/**
 * Smoke test — verifies the Azure OpenAI wire is live before any T1 code lands.
 *
 * Run from repo root:
 *   bun run mastra/smoke.ts
 *
 * Approach: hit Azure's new `/openai/v1` surface with the standard OpenAI
 * provider from the AI SDK. The endpoint is OpenAI-compatible; we just need
 * to add `?api-version=preview` to every request via a fetch wrapper.
 */

import { Agent } from "@mastra/core/agent";
import { createOpenAI } from "@ai-sdk/openai";
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

const baseURL = `https://${AZURE_RESOURCE_NAME}.openai.azure.com/openai/v1`;

console.log("env ok");
console.log("  base:", baseURL);
console.log("  deployment:", AZURE_CHAT_DEPLOYMENT);
console.log("  api-version:", AZURE_API_VERSION);

// Azure's /openai/v1 surface needs ?api-version=... on every request.
const azureFetch = Object.assign(
  (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input.toString());
    url.searchParams.set("api-version", AZURE_API_VERSION);
    return fetch(url, init);
  },
  {
    preconnect: (...args: Parameters<typeof fetch.preconnect>) =>
      fetch.preconnect?.(...args),
  },
) satisfies typeof fetch;

const openai = createOpenAI({
  apiKey: AZURE_API_KEY,
  baseURL,
  fetch: azureFetch,
});

const agent = new Agent({
  id: "smoke",
  name: "smoke",
  instructions: "Reply with exactly the word: pong",
  model: openai.chat(AZURE_CHAT_DEPLOYMENT),
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
  model: openai.embedding(AZURE_EMBEDDING_DEPLOYMENT),
  value: "smoke test embedding input",
});
const ems = Date.now() - t1;

if (!Array.isArray(embedding) || embedding.length === 0) {
  console.error("FAIL: empty embedding vector");
  process.exit(1);
}

console.log(`vector (${ems}ms): dim=${embedding.length}, sample=[${embedding.slice(0, 3).map((n) => n.toFixed(4)).join(", ")}, ...]`);
console.log("PASS");
