import { createHash } from 'node:crypto';
import { env } from 'node:process';
import { LibSQLVector } from '@mastra/libsql';

import type { EmbeddingVector } from './embeddings';
import type { TextChunk } from './chunker';

export interface ProjectKnowledgeChunk {
  projectId: string;
  source: string;
  chunkIndex: number;
  text: string;
  embedding: EmbeddingVector;
}

export interface ProjectKnowledgeResult {
  text: string;
  source: string;
  score: number;
}

interface ProjectKnowledgeMetadata {
  projectId: string;
  source: string;
  chunkIndex: number;
  text: string;
  hash: string;
}

const INDEX_NAME = 'project_knowledge';
const VECTOR_DIMENSION = 1536;
const VECTOR_METRIC = 'cosine';

const vectorStore = new LibSQLVector({
  id: 'project-knowledge',
  url: requireEnv('LIBSQL_URL'),
});

let indexReady: Promise<void> | undefined;

export function hashChunkText(text: string): string {
  return createHash('sha256').update(normalizeForHash(text)).digest('hex');
}

export function chunksToKnowledgeRows(input: {
  projectId: string;
  source: string;
  chunks: TextChunk[];
  embeddings: EmbeddingVector[];
}): ProjectKnowledgeChunk[] {
  if (input.chunks.length !== input.embeddings.length) {
    throw new Error('chunks and embeddings must have the same length');
  }

  return input.chunks.map((chunk, index) => {
    const embedding = input.embeddings[index];

    if (!embedding) {
      throw new Error(`Missing embedding for chunk ${chunk.chunkIndex}`);
    }

    return {
      projectId: input.projectId,
      source: input.source,
      chunkIndex: chunk.chunkIndex,
      text: chunk.text,
      embedding,
    };
  });
}

export async function upsertProjectKnowledge(chunks: ProjectKnowledgeChunk[]): Promise<string[]> {
  if (chunks.length === 0) {
    return [];
  }

  await ensureProjectKnowledgeIndex();

  return vectorStore.upsert({
    indexName: INDEX_NAME,
    ids: chunks.map(chunk => chunkId(chunk)),
    vectors: chunks.map(chunk => chunk.embedding),
    metadata: chunks.map(chunk => metadataForChunk(chunk)),
  });
}

export async function queryProjectKnowledge(input: {
  projectId: string;
  queryVector: EmbeddingVector;
  k: number;
}): Promise<ProjectKnowledgeResult[]> {
  await ensureProjectKnowledgeIndex();

  const results = await vectorStore.query({
    indexName: INDEX_NAME,
    queryVector: input.queryVector,
    topK: input.k,
    filter: { projectId: input.projectId },
    includeVector: false,
  });

  return results.flatMap(result => {
    const metadata = parseMetadata(result.metadata);

    if (!metadata) {
      return [];
    }

    return [{
      text: metadata.text,
      source: metadata.source,
      score: result.score,
    }];
  });
}

async function ensureProjectKnowledgeIndex(): Promise<void> {
  indexReady ??= createProjectKnowledgeIndex();
  return indexReady;
}

async function createProjectKnowledgeIndex(): Promise<void> {
  const indexes = await vectorStore.listIndexes();

  if (indexes.includes(INDEX_NAME)) {
    return;
  }

  await vectorStore.createIndex({
    indexName: INDEX_NAME,
    dimension: VECTOR_DIMENSION,
    metric: VECTOR_METRIC,
  });
}

function requireEnv(name: string): string {
  const value = env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function chunkId(chunk: ProjectKnowledgeChunk): string {
  return `${chunk.projectId}:${chunk.source}:${chunk.chunkIndex}:${hashChunkText(chunk.text)}`;
}

function metadataForChunk(chunk: ProjectKnowledgeChunk): ProjectKnowledgeMetadata {
  return {
    projectId: chunk.projectId,
    source: chunk.source,
    chunkIndex: chunk.chunkIndex,
    text: chunk.text,
    hash: hashChunkText(chunk.text),
  };
}

function parseMetadata(metadata: Record<string, unknown> | undefined): ProjectKnowledgeMetadata | undefined {
  if (!metadata) {
    return undefined;
  }

  const projectId = metadata.projectId;
  const source = metadata.source;
  const chunkIndex = metadata.chunkIndex;
  const text = metadata.text;
  const hash = metadata.hash;

  if (
    typeof projectId !== 'string'
    || typeof source !== 'string'
    || typeof chunkIndex !== 'number'
    || typeof text !== 'string'
    || typeof hash !== 'string'
  ) {
    return undefined;
  }

  return { projectId, source, chunkIndex, text, hash };
}

function normalizeForHash(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}
