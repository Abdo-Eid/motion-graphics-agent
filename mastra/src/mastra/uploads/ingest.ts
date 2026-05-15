import { extname } from 'node:path';

import { handle as handleCsv } from './handlers/csv';
import { handle as handleImage } from './handlers/image';
import { handle as handlePdf } from './handlers/pdf';
import { handle as handleText } from './handlers/text';

export type UploadKind = 'asset' | 'reference';
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

export async function ingestUpload(input: UploadInput): Promise<IngestResult> {
  const handlerKind = detectHandlerKind(input);

  if (handlerKind === null) {
    return { assetId: input.assetId, ingestStatus: 'errored' };
  }

  switch (handlerKind) {
    case 'pdf':
      return handlePdf(input);
    case 'text':
      return handleText(input);
    case 'csv':
      return handleCsv(input);
    case 'image':
      return handleImage(input);
  }
}

/**
 * Returns null for unsupported MIME types (caller should respond 415).
 */
export function detectHandlerKind(
  input: Pick<UploadInput, 'mime' | 'originalName'>,
): UploadHandlerKind | null {
  const mime = normalizeMime(input.mime);
  const extension = extname(input.originalName).toLowerCase();

  if (mime === 'application/pdf') {
    return 'pdf';
  }

  if ((mime === 'text/plain' && extension === '.txt') || (mime === 'text/markdown' && extension === '.md')) {
    return 'text';
  }

  if (mime === 'text/csv' && extension === '.csv') {
    return 'csv';
  }

  if (mime.startsWith('image/')) {
    return 'image';
  }

  return null;
}

/**
 * Normalizes a MIME type string by removing any parameters, trimming whitespace,
 * and converting the result to lowercase.
 *
 * @param mime - The raw MIME string, such as `"Text/Plain; charset=utf-8"`.
 * @returns The normalized base MIME type, such as `"text/plain"`, or an empty string if none is present.
 */
function normalizeMime(mime: string): string {
  return mime.split(';', 1)[0]?.trim().toLowerCase() ?? '';
}
