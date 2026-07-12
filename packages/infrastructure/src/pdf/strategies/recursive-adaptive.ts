import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import type { SmartTextSplitter, SplitChunk, ChunkMeta } from '@app/domain';

const MIN_BLOCK_CHARS = 200;
const MAX_CHUNK_CHARS = 800;
const CHUNK_OVERLAP = 100;

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: MAX_CHUNK_CHARS,
  chunkOverlap: CHUNK_OVERLAP,
});

export const adaptiveRecursiveSplitter: SmartTextSplitter = {
  async splitDocument(doc, opts) {
    const paragraphs = doc.text
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean);

    const blocks: string[] = [];
    let current = '';
    for (const paragraph of paragraphs) {
      if (current.length === 0) {
        current = paragraph;
      } else if (current.length < MIN_BLOCK_CHARS) {
        current = `${current}\n\n${paragraph}`;
      } else {
        blocks.push(current);
        current = paragraph;
      }
    }
    if (current.length > 0) blocks.push(current);

    const chunks: SplitChunk[] = [];
    let chunkIndex = 0;
    for (const block of blocks) {
      const pieces =
        block.length > MAX_CHUNK_CHARS
          ? await splitter.splitText(block)
          : [block];
      for (const piece of pieces) {
        const meta: ChunkMeta = { chunkIndex, docTitle: opts.docTitle };
        chunks.push({ content: piece, metadata: meta });
        chunkIndex++;
      }
    }
    return chunks;
  },
};
