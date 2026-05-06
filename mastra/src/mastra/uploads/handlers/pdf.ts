import { PDFParse } from 'pdf-parse';

import { ingestTextIntoKnowledge } from '../../knowledge/ingest-text';
import type { IngestResult, UploadInput } from '../ingest';

export async function handle(input: UploadInput): Promise<IngestResult> {
  const buffer = Buffer.from(await input.file.arrayBuffer());
  const parser = new PDFParse({ data: buffer });

  try {
    const { text } = await parser.getText();

    await ingestTextIntoKnowledge({
      projectId: input.projectId,
      source: input.originalName,
      text,
    });

    return {
      assetId: input.assetId,
      ingestStatus: 'done',
      source: input.originalName,
    };
  } finally {
    await parser.destroy();
  }
}
