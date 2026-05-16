import type { IngestResult, UploadInput } from '../ingest';
import { persistUpload } from '../persist';

export async function handle(input: UploadInput): Promise<IngestResult> {
  const upload = await persistUpload(input);

  return {
    assetId: input.assetId,
    ingestStatus: 'done',
    path: upload.path,
    originalName: upload.originalName,
    mime: upload.mime,
    bytes: upload.bytes,
  };
}
