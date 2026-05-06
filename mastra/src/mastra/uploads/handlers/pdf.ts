import { PDFParse } from 'pdf-parse';

import { chunkText } from '../../knowledge/chunker';
import { embedTexts } from '../../knowledge/embeddings';
import { chunksToKnowledgeRows, upsertProjectKnowledge } from '../../knowledge/store';
import type { IngestContext, IngestResult, UploadInput } from '../ingest';

export async function handle(input: UploadInput, _ctx: IngestContext): Promise<IngestResult> {
  const buffer = Buffer.from(await input.file.arrayBuffer());
  const parser = new PDFParse({ data: buffer });

  try {
    const result = await parser.getText();
    const chunks = chunkText(result.text);

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
  } finally {
    await parser.destroy();
  }
}
