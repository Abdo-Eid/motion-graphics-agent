/**
 * Studio attachment bridge — DEV ONLY.
 *
 * Mastra Studio sends agent messages with file parts shaped like:
 *   { type: "file", data: "data:application/pdf;base64,...", mimeType, filename }
 *
 * Those file parts go to the model directly (so the agent can answer
 * immediately), but they never hit our /uploads route — meaning the
 * Knowledge Store never sees them. This middleware sniffs the request body
 * on /api/agents/* /stream, finds file parts, decodes them, and runs them
 * through ingestUpload() so a follow-up turn can use retrieveProjectKnowledge.
 *
 * It does NOT mutate the body. The original message stream proceeds
 * untouched. We await ingestion before next() so a same-turn follow-up
 * (e.g. "summarize this") can already hit the index — at the cost of a
 * small first-token delay. See PROJECT_OVERVIEW.md for the durable
 * upload path that this temporarily complements.
 */
import { detectHandlerKind, ingestUpload } from './ingest';

// Hono is a transitive dep of @mastra/core; we don't depend on it directly.
// Define just enough shape to type the middleware we hand back to Mastra.
interface MinimalHonoContext {
  req: { raw: Request };
}
type Next = () => Promise<void>;
type StudioMiddleware = (c: MinimalHonoContext, next: Next) => Promise<void | Response>;

const DATA_URL_RE = /^data:([^;,]+)(?:;[^,]*)?,(.*)$/s;

interface MaybeFilePart {
  type?: unknown;
  data?: unknown;
  url?: unknown;
  mimeType?: unknown;
  mediaType?: unknown;
  filename?: unknown;
  name?: unknown;
}

interface FoundFile {
  data: string;
  mime: string;
  filename: string;
}

export function createStudioAttachmentMiddleware(): StudioMiddleware {
  return async (c, next) => {
    if (process.env.STUDIO_ATTACHMENT_INGEST === 'false') {
      return next();
    }

    try {
      const raw = c.req.raw.clone();
      const body = (await raw.json()) as Record<string, unknown> | null;

      if (body && typeof body === 'object') {
        const projectId = pickProjectId(body);
        const files = collectFiles(body);

        if (projectId && files.length > 0) {
          for (const f of files) {
            await ingestOne({ projectId, file: f }).catch((err) => {
              console.warn('[studio-bridge] ingest failed', {
                filename: f.filename,
                error: err instanceof Error ? err.message : String(err),
              });
            });
          }
        }
      }
    } catch (err) {
      // Never block the model stream because of bridge issues.
      console.warn('[studio-bridge] middleware error', err);
    }

    return next();
  };
}

function pickProjectId(body: Record<string, unknown>): string | null {
  const memory = body.memory as { thread?: unknown; resource?: unknown } | undefined;
  const candidate =
    (typeof memory?.thread === 'string' && memory.thread) ||
    (typeof memory?.resource === 'string' && memory.resource) ||
    null;

  if (!candidate) return null;
  return candidate.trim() || null;
}

function collectFiles(body: Record<string, unknown>): FoundFile[] {
  const out: FoundFile[] = [];
  const messages = body.messages;
  if (!Array.isArray(messages)) return out;

  for (const msg of messages) {
    if (!msg || typeof msg !== 'object') continue;
    const m = msg as { parts?: unknown; content?: unknown; experimental_attachments?: unknown };

    for (const part of iterParts(m.parts)) tryPush(out, part);
    for (const part of iterParts(m.content)) tryPush(out, part);
    for (const part of iterParts(m.experimental_attachments)) tryPush(out, part);
  }

  return out;
}

function iterParts(value: unknown): MaybeFilePart[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v) => v && typeof v === 'object') as MaybeFilePart[];
}

function tryPush(out: FoundFile[], part: MaybeFilePart): void {
  if (part.type !== 'file') return;

  const mime =
    (typeof part.mimeType === 'string' && part.mimeType) ||
    (typeof part.mediaType === 'string' && part.mediaType) ||
    '';
  const filename =
    (typeof part.filename === 'string' && part.filename) ||
    (typeof part.name === 'string' && part.name) ||
    'attachment';

  const data =
    (typeof part.data === 'string' && part.data) ||
    (typeof part.url === 'string' && part.url) ||
    '';

  if (!data) return;
  out.push({ data, mime, filename });
}

async function ingestOne(args: { projectId: string; file: FoundFile }): Promise<void> {
  const { projectId, file } = args;

  const { bytes, mime } = decodeDataPayload(file.data, file.mime);
  if (!bytes) {
    console.warn('[studio-bridge] could not decode file payload', { filename: file.filename });
    return;
  }

  const detected = detectHandlerKind({ mime, originalName: file.filename });
  if (detected === null) {
    console.warn('[studio-bridge] unsupported attachment, skipping', {
      mime,
      filename: file.filename,
    });
    return;
  }

  const fileObj = new File([bytes], file.filename, { type: mime });
  const assetId = crypto.randomUUID();

  const result = await ingestUpload({
    assetId,
    projectId,
    file: fileObj,
    originalName: file.filename,
    mime,
  });

  console.info('[studio-bridge] ingested studio attachment', {
    projectId,
    filename: file.filename,
    mime,
    ingestStatus: result.ingestStatus,
  });
}

function decodeDataPayload(
  raw: string,
  fallbackMime: string,
): { bytes: Uint8Array | null; mime: string } {
  const match = DATA_URL_RE.exec(raw);
  if (match) {
    const mime = match[1] || fallbackMime || 'application/octet-stream';
    const payload = match[2] ?? '';
    try {
      const buf = Buffer.from(payload, 'base64');
      return { bytes: new Uint8Array(buf), mime };
    } catch {
      return { bytes: null, mime };
    }
  }

  // Some clients send bare base64 without the data: prefix.
  if (/^[A-Za-z0-9+/=\s]+$/.test(raw) && raw.length > 16) {
    try {
      const buf = Buffer.from(raw, 'base64');
      return { bytes: new Uint8Array(buf), mime: fallbackMime || 'application/octet-stream' };
    } catch {
      return { bytes: null, mime: fallbackMime };
    }
  }

  return { bytes: null, mime: fallbackMime };
}
