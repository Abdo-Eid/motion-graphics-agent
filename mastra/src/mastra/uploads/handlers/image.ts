import { mkdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { env } from 'node:process';

import type { IngestContext, IngestResult, UploadInput } from '../ingest';

interface AssetRecord {
  id: string;
  path: string;
  originalName: string;
  mime: string;
  bytes: number;
  description: string;
  createdAt: string;
}

const assets: AssetRecord[] = [];

export async function handle(input: UploadInput, _ctx: IngestContext): Promise<IngestResult> {
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

  const extension = extensionOf(input.originalName);
  const relativePath = `assets/${input.assetId}${extension}`;
  const absolutePath = workspacePath(relativePath);

  await mkdir(workspacePath('assets'), { recursive: true });
  await writeFile(absolutePath, Buffer.from(await input.file.arrayBuffer()));

  const fileStat = await stat(absolutePath);
  const asset: AssetRecord = {
    id: input.assetId,
    path: relativePath,
    originalName: input.originalName,
    mime: input.mime,
    bytes: fileStat.size,
    description: '',
    createdAt: new Date().toISOString(),
  };

  await addAsset(asset, {
    threadId: input.projectId,
    resourceId: input.projectId,
  });

  return {
    assetId: input.assetId,
    ingestStatus: 'done',
    path: relativePath,
  };
}

async function addAsset(asset: AssetRecord, _ctx: { threadId: string; resourceId: string }): Promise<void> {
  assets.push(asset);
}

function workspacePath(relativePath: string): string {
  return join(env.SANDBOX_WORKSPACE_DIR ?? '../sandbox/.workspace', relativePath);
}

function extensionOf(filename: string): string {
  const dotIndex = filename.lastIndexOf('.');

  if (dotIndex === -1) {
    return '';
  }

  return filename.slice(dotIndex).toLowerCase();
}
