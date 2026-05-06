/**
 * Project Knowledge Store — vector index of chunks extracted from user uploads
 * (PDFs, .md, .txt). Read by the Planner and Art Director through the
 * `retrieveProjectKnowledge` tool; never read by the Implementor.
 *
 * This is intentionally a SEPARATE LibSQLVector instance from Mastra Memory's
 * Semantic Recall vector store. Semantic Recall is RAG over chat history (we
 * don't use it — Observational Memory covers that need). This index is
 * RAG over project documents, which has a different lifecycle and scope.
 * Same DB file is fine; different logical index.
 */

import { LibSQLVector } from '@mastra/libsql';

export interface ProjectKnowledgeResult {
  text: string;
  source: string;
  score: number;
}

// Shape stored on each upserted row. LibSQL persists this as untyped JSON, so
// `parseMetadata` below re-validates at read time — never trust the columns.
interface ProjectKnowledgeMetadata {
  projectId: string;
  source: string;
  chunkIndex: number;
  text: string;
}

const INDEX_NAME = 'project_knowledge';
// 1536 matches Azure `text-embedding-3-small` (the deployment configured in
// AZURE_EMBEDDING_DEPLOYMENT). Changing the embedding model means recreating
// this index — vectors of different dims cannot share an index.
const VECTOR_DIMENSION = 1536;
const VECTOR_METRIC = 'cosine';

const vectorStore = new LibSQLVector({
  id: 'project-knowledge',
  url: 'file:./mastra.db',
});

// Lazy index bootstrap. LibSQLVector requires an explicit createIndex before
// first upsert/query, but createIndex throws if the index already exists.
// Caching the promise at module scope guarantees we only check-and-create once
// per process and that concurrent first-callers all await the same operation
// (no race between two uploads landing simultaneously on a fresh DB).
let indexReady: Promise<void> | undefined;

/**
 * Insert or update one source's chunks for a project.
 *
 * `texts[i]` and `embeddings[i]` must align — the array index becomes the
 * stable chunk number used in the row id. Re-uploading the same `(projectId,
 * source)` overwrites by id, so revisions of a doc replace the previous
 * version cleanly without dangling chunks (assuming the new version produces
 * at least as many chunks; shorter re-uploads leave tail rows behind, which
 * is acceptable for MVP).
 */
export async function upsertProjectKnowledge(input: {
  projectId: string;
  source: string;
  texts: string[];
  embeddings: number[][];
}): Promise<string[]> {
  if (input.texts.length === 0) {
    return [];
  }

  if (input.texts.length !== input.embeddings.length) {
    throw new Error('texts and embeddings must have the same length');
  }

  await ensureProjectKnowledgeIndex();

  // Row id encodes both the project (for collision-safety across tenants) and
  // the source filename (so different docs in the same project can share
  // chunkIndex 0 without clashing).
  const ids = input.texts.map(
    (_, chunkIndex) => `${input.projectId}:${input.source}:${chunkIndex}`,
  );
  const metadata: ProjectKnowledgeMetadata[] = input.texts.map((text, chunkIndex) => ({
    projectId: input.projectId,
    source: input.source,
    chunkIndex,
    text,
  }));

  return vectorStore.upsert({
    indexName: INDEX_NAME,
    ids,
    vectors: input.embeddings,
    metadata,
  });
}

/**
 * Query the top-k chunks for a project. The `projectId` filter is the
 * tenancy boundary — without it, projects would leak chunks into each
 * other's retrieval. Caller is responsible for cosine-score interpretation
 * (LibSQLVector returns higher = more similar for the cosine metric).
 */
export async function queryProjectKnowledge(input: {
  projectId: string;
  queryVector: number[];
  k: number;
}): Promise<ProjectKnowledgeResult[]> {
  await ensureProjectKnowledgeIndex();

  const results = await vectorStore.query({
    indexName: INDEX_NAME,
    queryVector: input.queryVector,
    topK: input.k,
    filter: { projectId: input.projectId },
    // We never need the embedding back at the agent layer; saves bandwidth.
    includeVector: false,
  });

  // flatMap drops rows whose metadata fails the read-time guard. Better to
  // silently skip a corrupted row than to return malformed text to the agent.
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
  // listIndexes is cheap; calling createIndex on an existing index throws.
  // The check + skip is the documented Mastra pattern for idempotent setup.
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

/**
 * Read-time validator. Metadata comes back as `Record<string, unknown>` from
 * LibSQL, so we type-check each field individually. A row that doesn't pass
 * is treated as garbage and excluded by the caller.
 */
function parseMetadata(
  metadata: Record<string, unknown> | undefined,
): ProjectKnowledgeMetadata | undefined {
  if (!metadata) {
    return undefined;
  }

  const { projectId, source, chunkIndex, text } = metadata;

  if (
    typeof projectId !== 'string'
    || typeof source !== 'string'
    || typeof chunkIndex !== 'number'
    || typeof text !== 'string'
  ) {
    return undefined;
  }

  return { projectId, source, chunkIndex, text };
}
