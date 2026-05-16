import { randomUUID } from 'node:crypto';
import type { ApiRoute } from '@mastra/core/server';

import { bus } from '../server/bus';
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

      const cleanProjectId = projectId.trim();
      const assetId = randomUUID();
      bus.emitEvent('upload.status', {
        projectId: cleanProjectId,
        assetId,
        status: 'pending',
        originalName: file.name,
        mime: file.type,
      });

      try {
        const result = await ingestUpload({
          assetId,
          projectId: cleanProjectId,
          file,
          originalName: file.name,
          mime: file.type,
          kind,
        });
        bus.emitEvent('upload.status', {
          projectId: cleanProjectId,
          assetId: result.assetId,
          status: result.ingestStatus,
          path: result.path,
          originalName: result.originalName,
          mime: result.mime,
        });

        return c.json({
          assetId: result.assetId,
          ingestStatus: result.ingestStatus,
          path: result.path,
          originalName: result.originalName,
          mime: result.mime,
          bytes: result.bytes,
        });
      } catch (error) {
        bus.emitEvent('upload.status', {
          projectId: cleanProjectId,
          assetId,
          status: 'errored',
          originalName: file.name,
          mime: file.type,
        });
        return c.json({
          assetId,
          ingestStatus: 'errored' as const,
          error: error instanceof Error ? error.message : 'Upload ingestion failed',
        }, 500);
      }
    },
  },
];
