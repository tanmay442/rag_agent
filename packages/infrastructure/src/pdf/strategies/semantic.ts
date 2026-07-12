import type {
  SmartTextSplitter,
  SplitChunk,
  ChunkMeta,
  EmbeddingService,
} from '@app/domain';

const SIMILARITY_THRESHOLD = 0.3;
const MIN_CHUNK_CHARS = 300;
const MAX_CHUNK_CHARS = 600;

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function splitSentences(text: string): string[] {
  const parts = text.match(/[^.!?]+[.!?]*/g);
  if (!parts) return text.trim() ? [text.trim()] : [];
  return parts.map((p) => p.trim()).filter(Boolean);
}

function meanPool(embeddings: number[][]): number[] {
  const dim = embeddings[0]?.length ?? 0;
  const sum = new Array(dim).fill(0);
  for (const emb of embeddings) {
    for (let i = 0; i < dim; i++) sum[i] += emb[i];
  }
  return sum.map((v) => v / embeddings.length);
}

export function makeSemanticSplitter(
  embeddings: EmbeddingService,
): SmartTextSplitter {
  return {
    async splitDocument(doc, opts) {
      const sentences = splitSentences(doc.text);
      if (sentences.length === 0) return [];

      const sentenceEmbeddings = await embeddings.embedBatch(sentences);

      const groups: number[][] = [];
      let current: number[] = [0];
      for (let i = 1; i < sentences.length; i++) {
        const sim = cosineSimilarity(
          sentenceEmbeddings[i - 1],
          sentenceEmbeddings[i],
        );
        const currentText = current
          .map((idx) => sentences[idx])
          .join(' ');
        if (
          sim < SIMILARITY_THRESHOLD ||
          currentText.length > MAX_CHUNK_CHARS
        ) {
          groups.push(current);
          current = [i];
        } else {
          current.push(i);
        }
      }
      if (current.length > 0) groups.push(current);

      const chunks: SplitChunk[] = [];
      let chunkIndex = 0;
      for (const group of groups) {
        const text = group.map((idx) => sentences[idx]).join(' ');
        if (text.length < MIN_CHUNK_CHARS && chunks.length > 0) {
          const prev = chunks[chunks.length - 1];
          prev.content = `${prev.content} ${text}`;
          prev.embedding = meanPool(
            group
              .map((idx) => sentenceEmbeddings[idx])
              .concat(
                prev.embedding
                  ? [prev.embedding]
                  : [],
              ),
          );
          continue;
        }
        const meta: ChunkMeta = { chunkIndex, docTitle: opts.docTitle };
        chunks.push({
          content: text,
          embedding: meanPool(group.map((idx) => sentenceEmbeddings[idx])),
          metadata: meta,
        });
        chunkIndex++;
      }
      return chunks;
    },
  };
}
