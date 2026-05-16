import { ingestTextIntoKnowledge } from '../../knowledge/ingest-text';
import type { IngestResult, UploadInput } from '../ingest';
import { persistUpload } from '../persist';

export async function handle(input: UploadInput): Promise<IngestResult> {
  const upload = await persistUpload(input);

  await ingestTextIntoKnowledge({
    projectId: input.projectId,
    source: upload.path,
    text: await input.file.text(),
    markdown: input.originalName.toLowerCase().endsWith('.md'),
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
}
