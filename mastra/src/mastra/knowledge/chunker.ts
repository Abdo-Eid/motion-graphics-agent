export interface TextChunk {
  chunkIndex: number;
  text: string;
}

export interface ChunkOptions {
  chunkTokens?: number;
  overlapTokens?: number;
  markdown?: boolean;
}

const DEFAULT_CHUNK_TOKENS = 500;
const DEFAULT_OVERLAP_TOKENS = 50;

export function chunkText(text: string, options: ChunkOptions = {}): TextChunk[] {
  const chunkTokens = options.chunkTokens ?? DEFAULT_CHUNK_TOKENS;
  const overlapTokens = options.overlapTokens ?? DEFAULT_OVERLAP_TOKENS;
  validateChunkOptions(chunkTokens, overlapTokens);

  const normalized = normalizeText(text);

  if (!normalized) {
    return [];
  }

  const sections = options.markdown ? splitMarkdownSections(normalized) : [normalized];
  const chunks: string[] = [];
  let carry: string[] = [];

  for (const section of sections) {
    const words = toWords(section);

    if (words.length === 0) {
      continue;
    }

    if (words.length > chunkTokens) {
      flushCarry(chunks, carry);
      chunks.push(...chunkWords(words, chunkTokens, overlapTokens));
      carry = [];
      continue;
    }

    if (carry.length + words.length > chunkTokens) {
      flushCarry(chunks, carry);
      carry = tail(carry, overlapTokens);
    }

    carry.push(...words);
  }

  flushCarry(chunks, carry);

  return chunks.map((chunk, chunkIndex) => ({
    chunkIndex,
    text: chunk,
  }));
}

function validateChunkOptions(chunkTokens: number, overlapTokens: number): void {
  if (!Number.isInteger(chunkTokens) || chunkTokens <= 0) {
    throw new Error('chunkTokens must be a positive integer');
  }

  if (!Number.isInteger(overlapTokens) || overlapTokens < 0) {
    throw new Error('overlapTokens must be a non-negative integer');
  }

  if (overlapTokens >= chunkTokens) {
    throw new Error('overlapTokens must be smaller than chunkTokens');
  }
}

function normalizeText(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function splitMarkdownSections(text: string): string[] {
  const sections: string[] = [];
  let current: string[] = [];

  for (const line of text.split('\n')) {
    if (/^#{1,6}\s+/.test(line) && current.length > 0) {
      sections.push(current.join('\n').trim());
      current = [];
    }

    current.push(line);
  }

  if (current.length > 0) {
    sections.push(current.join('\n').trim());
  }

  return sections.filter(Boolean);
}

// MVP approximation: whitespace-delimited words stand in for model tokens.
function toWords(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

function chunkWords(words: string[], chunkTokens: number, overlapTokens: number): string[] {
  const chunks: string[] = [];
  const step = Math.max(1, chunkTokens - overlapTokens);

  for (let start = 0; start < words.length; start += step) {
    chunks.push(words.slice(start, start + chunkTokens).join(' '));
  }

  return chunks;
}

function tail(words: string[], count: number): string[] {
  return words.slice(Math.max(0, words.length - count));
}

function flushCarry(chunks: string[], carry: string[]): void {
  if (carry.length > 0) {
    chunks.push(carry.join(' '));
  }
}