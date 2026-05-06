import { mkdir, stat, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

import { appendAsset } from '../../memory/access';
import { sandboxRoot } from '../../sandbox-root';
import type { IngestResult, UploadInput } from '../ingest';

export async function handle(input: UploadInput): Promise<IngestResult> {
  if (input.kind === 'reference') {
    return {
      assetId: input.assetId,
      ingestStatus: 'done',
      source: input.originalName,
    };
  }

  if (input.kind !== 'asset') {
    throw new Error('Image uploads require kind=asset or kind=reference');
  }

  const relativePath = `assets/${input.assetId}${extname(input.originalName).toLowerCase()}`;
  const absolutePath = join(sandboxRoot, relativePath);

  await mkdir(join(sandboxRoot, 'assets'), { recursive: true });
  await writeFile(absolutePath, Buffer.from(await input.file.arrayBuffer()));

  const fileStat = await stat(absolutePath);

  await appendAsset({
    projectId: input.projectId,
    asset: {
      id: input.assetId,
      path: relativePath,
      originalName: input.originalName,
      mime: input.mime,
      bytes: fileStat.size,
      description: '',
    },
  });

  return {
    assetId: input.assetId,
    ingestStatus: 'done',
    path: relativePath,
  };
}
