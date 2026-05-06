import { randomBytes } from 'node:crypto';
import type { ApiRoute } from '@mastra/core/server';

import { handle as handleCsv } from './handlers/csv';
import { handle as handleImage } from './handlers/image';
import { handle as handlePdf } from './handlers/pdf';
import { handle as handleText } from './handlers/text';
import {
  UnsupportedUploadTypeError,
  ingestUpload,
  type IngestStatus,
  type StatusEvent,
  type UploadHandlers,
} from './ingest';

const handlers: UploadHandlers = {
  pdf: handlePdf,
  text: handleText,
  csv: handleCsv,
  image: handleImage,
};

const latestStatus = new Map<string, StatusEvent>();
const listeners = new Map<string, Set<(event: StatusEvent) => void>>();

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

      const normalizedProjectId = projectId.trim();

      if (kind !== undefined && typeof kind !== 'string') {
        return c.json({ error: 'Multipart field kind must be a string when provided' }, 400);
      }

      const assetId = nanoid();

      try {
        const result = await ingestUpload(
          {
            assetId,
            projectId: normalizedProjectId,
            file,
            originalName: file.name,
            mime: file.type,
            kind,
          },
          handlers,
          { emitStatus },
        );

        return c.json({
          assetId: result.assetId,
          ingestStatus: result.ingestStatus,
        });
      } catch (error) {
        if (error instanceof UnsupportedUploadTypeError) {
          return c.json({ error: error.message }, 415);
        }

        return c.json({
          assetId,
          ingestStatus: 'errored' satisfies IngestStatus,
          error: errorMessage(error),
        }, 500);
      }
    },
  },
  {
    path: '/uploads/:assetId/status',
    method: 'GET',
    handler: c => {
      const assetId = c.req.param('assetId');

      if (!assetId) {
        return c.json({ error: 'Missing upload assetId' }, 400);
      }

      const encoder = new TextEncoder();
      let listener: ((event: StatusEvent) => void) | undefined;

      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          listener = (event: StatusEvent) => {
            controller.enqueue(encoder.encode(formatSse(event)));
          };

          addStatusListener(assetId, listener);

          const current = latestStatus.get(assetId);
          if (current) {
            listener(current);
          }
        },
        cancel() {
          if (listener) {
            removeStatusListener(assetId, listener);
          }
        },
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      });
    },
  },
];

function emitStatus(event: StatusEvent): void {
  latestStatus.set(event.assetId, event);

  for (const listener of listeners.get(event.assetId) ?? []) {
    listener(event);
  }
}

function addStatusListener(assetId: string, listener: (event: StatusEvent) => void): void {
  const assetListeners = listeners.get(assetId) ?? new Set<(event: StatusEvent) => void>();
  assetListeners.add(listener);
  listeners.set(assetId, assetListeners);
}

function removeStatusListener(assetId: string, listener: (event: StatusEvent) => void): void {
  const assetListeners = listeners.get(assetId);

  if (!assetListeners) {
    return;
  }

  assetListeners.delete(listener);

  if (assetListeners.size === 0) {
    listeners.delete(assetId);
  }
}

function formatSse(event: StatusEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

function nanoid(): string {
  const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz-';
  const bytes = randomBytes(21);
  let id = '';

  for (const byte of bytes) {
    id += alphabet[byte & 63];
  }

  return id;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Upload ingestion failed';
}

