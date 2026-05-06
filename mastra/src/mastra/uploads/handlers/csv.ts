import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { env } from 'node:process';

import type { IngestContext, IngestResult, UploadInput } from '../ingest';

export async function handle(input: UploadInput, _ctx: IngestContext): Promise<IngestResult> {
  const relativePath = `uploads/${input.assetId}.csv`;
  const absolutePath = workspacePath(relativePath);

  await mkdir(workspacePath('uploads'), { recursive: true });
  await writeFile(absolutePath, Buffer.from(await input.file.arrayBuffer()));

  return {
    assetId: input.assetId,
    ingestStatus: 'done',
    path: relativePath,
  };
}

function workspacePath(relativePath: string): string {
  return join(env.SANDBOX_WORKSPACE_DIR ?? '../sandbox/.workspace', relativePath);
}
