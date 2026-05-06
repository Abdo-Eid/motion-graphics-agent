import { ingestTextIntoKnowledge } from '../../knowledge/ingest-text';
import type { IngestResult, UploadInput } from '../ingest';

export async function handle(input: UploadInput): Promise<IngestResult> {
  await ingestTextIntoKnowledge({
    projectId: input.projectId,
    source: input.originalName,
    text: await input.file.text(),
    markdown: input.originalName.toLowerCase().endsWith('.md'),
  });

  return {
    assetId: input.assetId,
    ingestStatus: 'done',
    source: input.originalName,
  };
}
