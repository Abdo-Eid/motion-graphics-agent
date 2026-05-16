import { mkdir, stat, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

import { appendUpload } from '../memory/access';
import { workspaceRoot } from '../workspace-root';
import type { UploadInput } from './ingest';

export async function persistUpload(input: UploadInput) {
  const relativePath = `uploads/${input.assetId}${extname(input.originalName).toLowerCase()}`;
  const absolutePath = join(workspaceRoot, relativePath);

  await mkdir(join(workspaceRoot, 'uploads'), { recursive: true });
  await writeFile(absolutePath, Buffer.from(await input.file.arrayBuffer()));

  const fileStat = await stat(absolutePath);
  const upload = await appendUpload({
    projectId: input.projectId,
    upload: {
      id: input.assetId,
      path: relativePath,
      originalName: input.originalName,
      mime: input.mime,
      bytes: fileStat.size,
      kind: input.kind,
      description: '',
    },
  });

  return upload;
}
