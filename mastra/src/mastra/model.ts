import { createAzure } from "@ai-sdk/azure";

import { requireEnv } from "./utils/env.ts";

const azure = createAzure({
    resourceName: requireEnv("AZURE_RESOURCE_NAME"),
    apiKey: requireEnv("AZURE_API_KEY"),
    apiVersion: requireEnv("AZURE_API_VERSION"),
});

/**
 * Shared chat model factory for every agent in T1A/T2/T3/T4.
 * Returns a model bound to the Azure chat deployment named in env.
 */
export function agentModel() {
    return azure(requireEnv("AZURE_CHAT_DEPLOYMENT"));
}

/**
 * Shared embedding model factory for T1B (Knowledge Store).
 * Returns a model bound to the Azure embedding deployment named in env.
 */
export function embeddingModel() {
    return azure.embedding(requireEnv("AZURE_EMBEDDING_DEPLOYMENT"));
}
