import type {
  SmartTextSplitter,
  SplitChunk,
  ChunkMeta,
  ParsedPage,
} from '@app/domain';

const MAX_CHUNK_CHARS = 800;
const MERGE_THRESHOLD = 50;
const HEADING_MAX_CHARS = 60;

function isHeading(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length === 0) return false;
  if (trimmed.endsWith(':')) return true;
  if (trimmed.startsWith('#')) return true;
  if (trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed)) return true;
  if (
    trimmed.length <= HEADING_MAX_CHARS &&
    !/[.!?]$/.test(trimmed) &&
    trimmed.split(/\s+/).length <= 12
  ) {
    return true;
  }
  return false;
}

function splitSentences(text: string): string[] {
  const parts = text.match(/[^.!?]+[.!?]*/g);
  if (!parts) return text.trim() ? [text.trim()] : [];
  return parts.map((p) => p.trim()).filter(Boolean);
}

function splitGroupAtSentences(group: string): string[] {
  const sentences = splitSentences(group);
  const pieces: string[] = [];
  let current = '';
  for (const sentence of sentences) {
    if (current.length + sentence.length > MAX_CHUNK_CHARS && current.length > 0) {
      pieces.push(current.trim());
      current = sentence;
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
  }
  if (current.trim()) pieces.push(current.trim());

  const merged: string[] = [];
  for (const piece of pieces) {
    const last = merged[merged.length - 1];
    if (last && last.length < MERGE_THRESHOLD) {
      merged[merged.length - 1] = `${last} ${piece}`;
    } else {
      merged.push(piece);
    }
  }
  return merged;
}

function buildPageChunks(
  page: ParsedPage,
  startIndex: number,
  docTitle?: string,
): { chunks: SplitChunk[]; nextIndex: number } {
  const lines = page.text.split(/\r?\n/);
  const chunks: SplitChunk[] = [];
  let chunkIndex = startIndex;
  let currentSection: string | undefined;
  let group: string[] = [];

  const flush = () => {
    if (group.length === 0) return;
    const joined = group.join('\n');
    if (joined.length > MAX_CHUNK_CHARS) {
      for (const piece of splitGroupAtSentences(joined)) {
        const meta: ChunkMeta = {
          page: page.page,
          chunkIndex,
          section: currentSection,
          docTitle,
        };
        chunks.push({ content: piece, metadata: meta });
        chunkIndex++;
      }
    } else {
      const meta: ChunkMeta = {
        page: page.page,
        chunkIndex,
        section: currentSection,
        docTitle,
      };
      chunks.push({ content: joined, metadata: meta });
      chunkIndex++;
    }
    group = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.length === 0) continue;
    if (isHeading(line)) {
      flush();
      currentSection = line;
      continue;
    }
    group.push(line);
  }
  flush();

  return { chunks, nextIndex: chunkIndex };
}

export const documentAwareSplitter: SmartTextSplitter = {
  async splitDocument(doc, opts) {
    const chunks: SplitChunk[] = [];
    let index = 0;
    for (const page of doc.pages) {
      const { chunks: pageChunks, nextIndex } = buildPageChunks(
        page,
        index,
        opts.docTitle,
      );
      chunks.push(...pageChunks);
      index = nextIndex;
    }
    return chunks;
  },
};
