import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { sandboxRoot } from '../../sandbox-root';
import type { IngestResult, UploadInput } from '../ingest';

export async function handle(input: UploadInput): Promise<IngestResult> {
  const relativePath = `uploads/${input.assetId}.csv`;

  await mkdir(join(sandboxRoot, 'uploads'), { recursive: true });
  await writeFile(join(sandboxRoot, relativePath), Buffer.from(await input.file.arrayBuffer()));

  return {
    assetId: input.assetId,
    ingestStatus: 'done',
    path: relativePath,
  };
}
