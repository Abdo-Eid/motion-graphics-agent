import { createOpenAI } from "@ai-sdk/openai";

function requireEnv(name: string): string {
    const value = process.env[name];
    if (!value || value.trim() === "") {
        throw new Error(`Missing or empty env var: ${name}`);
    }

    return value;
}

const baseURL = `https://${requireEnv("AZURE_RESOURCE_NAME")}.openai.azure.com/openai/v1`;
const apiVersion = requireEnv("AZURE_API_VERSION");

const azureFetch = Object.assign(
    (input: string | URL | Request, init?: RequestInit) => {
        const url = new URL(input.toString());
        url.searchParams.set("api-version", apiVersion);
        return fetch(url, init);
    },
    {
        preconnect: (...args: Parameters<typeof fetch.preconnect>) => fetch.preconnect?.(...args),
    },
) satisfies typeof fetch;

const openai = createOpenAI({
    apiKey: requireEnv("AZURE_API_KEY"),
    baseURL,
    fetch: azureFetch,
});

export function agentModel() {
    return openai.chat(requireEnv("AZURE_CHAT_DEPLOYMENT"));
}
