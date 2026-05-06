import { createHash } from 'node:crypto';
import { createOpenAI } from '@ai-sdk/openai';
import { embed, embedMany } from 'ai';
import { env } from 'node:process';

export type EmbeddingVector = number[];

const embeddingCache = new Map<string, EmbeddingVector>();

function requireEnv(name: string): string {
  const value = env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function embeddingModel() {
  const baseURL = requireEnv('EMBEDDING_BASE_URL');
  const openai = createOpenAI({
    apiKey: requireEnv('EMBEDDING_API_KEY'),
    baseURL,
    fetch: fetchWithApiVersion(baseURL),
  });

  return openai.embedding(requireEnv('EMBEDDING_MODEL'));
}

function fetchWithApiVersion(baseURL: string): typeof fetch | undefined {
  const apiVersion = env.EMBEDDING_API_VERSION ?? env.AZURE_API_VERSION;

  if (!apiVersion || !baseURL.includes('.openai.azure.com')) {
    return undefined;
  }

  return ((input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    url.searchParams.set('api-version', apiVersion);
    return fetch(url, init);
  }) as typeof fetch;
}

export async function embedText(value: string): Promise<EmbeddingVector> {
  const result = await embed({
    model: embeddingModel(),
    value,
  });

  return result.embedding;
}

export async function embedTexts(values: string[]): Promise<EmbeddingVector[]> {
  if (values.length === 0) {
    return [];
  }

  const embeddings = new Array<EmbeddingVector>(values.length);
  const misses: Array<{ index: number; hash: string; value: string }> = [];

  values.forEach((value, index) => {
    const hash = hashChunkText(value);
    const cached = embeddingCache.get(hash);

    if (cached) {
      embeddings[index] = cached;
      return;
    }

    misses.push({ index, hash, value });
  });

  if (misses.length > 0) {
    const result = await embedMany({
      model: embeddingModel(),
      values: misses.map(miss => miss.value),
    });

    result.embeddings.forEach((embedding, missIndex) => {
      const miss = misses[missIndex];

      if (!miss) {
        return;
      }

      embeddingCache.set(miss.hash, embedding);
      embeddings[miss.index] = embedding;
    });
  }

  return embeddings;
}

function hashChunkText(text: string): string {
  return createHash('sha256').update(normalizeForHash(text)).digest('hex');
}

function normalizeForHash(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}
