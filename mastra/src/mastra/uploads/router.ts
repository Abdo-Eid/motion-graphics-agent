import { randomUUID } from 'node:crypto';
import type { ApiRoute } from '@mastra/core/server';

import { detectHandlerKind, ingestUpload } from './ingest';

export const uploadRoutes: ApiRoute[] = [
  {
    path: '/uploads',
    method: 'POST',
    handler: async c => {
      const body = await c.req.parseBody();
      const file = body.file;
      const projectId = body.projectId;
      const kind = body.kind;

      if (!(file instanceof File)) {
        return c.json({ error: 'Missing required multipart field: file' }, 400);
      }

      if (typeof projectId !== 'string' || projectId.trim() === '') {
        return c.json({ error: 'Missing required multipart field: projectId' }, 400);
      }

      if (kind !== undefined && kind !== 'asset' && kind !== 'reference') {
        return c.json({ error: "Multipart field kind must be 'asset' or 'reference' when provided" }, 400);
      }

      if (detectHandlerKind({ mime: file.type, originalName: file.name }) === null) {
        return c.json({ error: `Unsupported upload type: ${file.type || 'unknown'} (${file.name})` }, 415);
      }

      const assetId = randomUUID();

      try {
        const result = await ingestUpload({
          assetId,
          projectId: projectId.trim(),
          file,
          originalName: file.name,
          mime: file.type,
          kind,
        });

        return c.json({
          assetId: result.assetId,
          ingestStatus: result.ingestStatus,
        });
      } catch (error) {
        return c.json({
          assetId,
          ingestStatus: 'errored' as const,
          error: error instanceof Error ? error.message : 'Upload ingestion failed',
        }, 500);
      }
    },
  },
];
