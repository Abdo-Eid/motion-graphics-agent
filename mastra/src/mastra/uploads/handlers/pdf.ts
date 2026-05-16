import { PDFParse } from 'pdf-parse';

import { ingestTextIntoKnowledge } from '../../knowledge/ingest-text';
import type { IngestResult, UploadInput } from '../ingest';
import { persistUpload } from '../persist';

export async function handle(input: UploadInput): Promise<IngestResult> {
  const upload = await persistUpload(input);
  const buffer = Buffer.from(await input.file.arrayBuffer());
  const parser = new PDFParse({ data: buffer });

  try {
    const { text } = await parser.getText();

    await ingestTextIntoKnowledge({
      projectId: input.projectId,
      source: upload.path,
      text,
    });

    return {
      assetId: input.assetId,
      ingestStatus: 'done',
      path: upload.path,
      source: upload.path,
      originalName: upload.originalName,
      mime: upload.mime,
      bytes: upload.bytes,
    };
  } finally {
    await parser.destroy();
  }
}
