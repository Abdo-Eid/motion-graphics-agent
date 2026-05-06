import { chunkText } from '../../knowledge/chunker';
import { embedTexts } from '../../knowledge/embeddings';
import { chunksToKnowledgeRows, upsertProjectKnowledge } from '../../knowledge/store';
import type { IngestContext, IngestResult, UploadInput } from '../ingest';

export async function handle(input: UploadInput, _ctx: IngestContext): Promise<IngestResult> {
  const text = await input.file.text();
  const chunks = chunkText(text, {
    markdown: input.originalName.toLowerCase().endsWith('.md'),
  });

  if (chunks.length > 0) {
    const embeddings = await embedTexts(chunks.map(chunk => chunk.text));
    const rows = chunksToKnowledgeRows({
      projectId: input.projectId,
      source: input.originalName,
      chunks,
      embeddings,
    });

    await upsertProjectKnowledge(rows);
  }

  return {
    assetId: input.assetId,
    ingestStatus: 'done',
    source: input.originalName,
  };
}
