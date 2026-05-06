export type UploadKind = 'asset' | 'reference' | string | undefined;
export type IngestStatus = 'pending' | 'done' | 'errored';
export type UploadHandlerKind = 'pdf' | 'text' | 'csv' | 'image';

export interface UploadInput {
  assetId: string;
  projectId: string;
  file: File;
  originalName: string;
  mime: string;
  kind?: UploadKind;
}

export interface IngestResult {
  assetId: string;
  ingestStatus: IngestStatus;
  path?: string;
  source?: string;
}

export interface StatusEvent {
  assetId: string;
  status: IngestStatus;
  message?: string;
  error?: string;
}

export interface IngestContext {
  emitStatus: (event: StatusEvent) => void;
}

export type UploadHandler = (
  input: UploadInput,
  ctx: IngestContext,
) => Promise<IngestResult>;

export interface UploadHandlers {
  pdf: UploadHandler;
  text: UploadHandler;
  csv: UploadHandler;
  image: UploadHandler;
}

export class UnsupportedUploadTypeError extends Error {
  constructor(public readonly mime: string, public readonly originalName: string) {
    super(`Unsupported upload type: ${mime || 'unknown'} (${originalName})`);
    this.name = 'UnsupportedUploadTypeError';
  }
}

export async function ingestUpload(
  input: UploadInput,
  handlers: UploadHandlers,
  ctx: IngestContext,
): Promise<IngestResult> {
  emit(ctx, {
    assetId: input.assetId,
    status: 'pending',
    message: 'Upload received',
  });

  try {
    const handlerKind = detectHandlerKind(input);
    const result = await handlers[handlerKind](input, ctx);

    emit(ctx, {
      assetId: input.assetId,
      status: result.ingestStatus,
    });

    return result;
  } catch (error) {
    emit(ctx, {
      assetId: input.assetId,
      status: 'errored',
      error: errorMessage(error),
    });

    throw error;
  }
}

export function detectHandlerKind(input: Pick<UploadInput, 'mime' | 'originalName'>): UploadHandlerKind {
  const mime = normalizeMime(input.mime);
  const extension = extensionOf(input.originalName);

  if (mime === 'application/pdf') {
    return 'pdf';
  }

  if (isTextUpload(mime, extension)) {
    return 'text';
  }

  if (isCsvUpload(mime, extension)) {
    return 'csv';
  }

  if (mime.startsWith('image/')) {
    return 'image';
  }

  throw new UnsupportedUploadTypeError(input.mime, input.originalName);
}

function isTextUpload(mime: string, extension: string): boolean {
  return (mime === 'text/plain' && extension === '.txt')
    || (mime === 'text/markdown' && extension === '.md');
}

function isCsvUpload(mime: string, extension: string): boolean {
  return mime === 'text/csv' && extension === '.csv';
}

function normalizeMime(mime: string): string {
  return mime.split(';', 1)[0]?.trim().toLowerCase() ?? '';
}

function extensionOf(filename: string): string {
  const dotIndex = filename.lastIndexOf('.');

  if (dotIndex === -1) {
    return '';
  }

  return filename.slice(dotIndex).toLowerCase();
}

function emit(ctx: IngestContext, event: StatusEvent): void {
  ctx.emitStatus(event);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Upload ingestion failed';
}
