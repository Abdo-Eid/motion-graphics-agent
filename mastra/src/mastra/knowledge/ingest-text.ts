/**
 * Text-to-knowledge pipeline. Shared by the PDF and text upload handlers —
 * each one extracts a UTF-8 string from its source file and hands it here.
 * This module owns the chunk → embed → upsert sequence so the handlers stay
 * thin and so we don't repeat the embedding/upsert pattern per file type.
 */

import { embedMany } from 'ai';
import { MDocument } from '@mastra/rag';

import { embeddingModel } from '../model';
import { upsertProjectKnowledge } from './store';

// Chunking knobs. Note: `maxSize` in MDocument is CHARACTER count, not tokens.
// 500 chars ≈ 80–125 tokens depending on text density, which fits well inside
// `text-embedding-3-small`'s 8192-token context with room to spare. If
// retrieval feels too granular on real docs, raise these — that's the tuning
// lever, not the strategy choice.
const CHUNK_MAX_SIZE = 500;
const CHUNK_OVERLAP = 50;

/**
 * Chunks `text` and writes the resulting embeddings into the project
 * knowledge index under `(projectId, source)`.
 *
 * Strategy choice:
 * - `markdown`  — preserves heading→body grouping. Used for `.md` uploads
 *                 (and could be used for any markdown-shaped doc).
 * - `recursive` — character-based smart-split with sensible separators.
 *                 Used for plain text and PDF-extracted text, which has no
 *                 reliable structure.
 *
 * We deliberately do NOT use `semantic-markdown` — it makes additional LLM
 * calls per document, which is overkill for MVP and burns budget.
 */
export async function ingestTextIntoKnowledge(input: {
  projectId: string;
  source: string;
  text: string;
  markdown?: boolean;
}): Promise<void> {
  // MDocument is Mastra's text container. The factory chosen here only
  // affects the default strategy; we override it explicitly on `chunk()`
  // below, so the practical difference is whether MDocument internally
  // strips/normalizes markdown structure before splitting.
  const doc = input.markdown
    ? MDocument.fromMarkdown(input.text)
    : MDocument.fromText(input.text);

  const chunks = await doc.chunk(
    input.markdown
      ? { strategy: 'markdown', maxSize: CHUNK_MAX_SIZE, overlap: CHUNK_OVERLAP }
      : { strategy: 'recursive', maxSize: CHUNK_MAX_SIZE, overlap: CHUNK_OVERLAP },
  );

  // Splitters can emit whitespace-only chunks at section boundaries (e.g.
  // between two adjacent headings with no body text). Embedding those wastes
  // tokens and pollutes the index with near-zero-information rows.
  const texts = chunks.map(chunk => chunk.text).filter(text => text.trim() !== '');

  if (texts.length === 0) {
    return;
  }

  // One batched call instead of one-per-chunk: AI SDK's `embedMany` packs all
  // values into a single provider request, which is both faster and cheaper
  // (provider-side batching discount on Azure OpenAI).
  const { embeddings } = await embedMany({
    model: embeddingModel(),
    values: texts,
  });

  await upsertProjectKnowledge({
    projectId: input.projectId,
    source: input.source,
    texts,
    embeddings,
  });
}
