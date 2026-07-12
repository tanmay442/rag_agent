import type {
  SmartTextSplitter,
  ChunkingStrategy,
  EmbeddingService,
} from '@app/domain';
import { documentAwareSplitter } from './document-aware';
import { adaptiveRecursiveSplitter } from './recursive-adaptive';
import { makeSemanticSplitter } from './semantic';

export { documentAwareSplitter } from './document-aware';
export { adaptiveRecursiveSplitter } from './recursive-adaptive';
export { makeSemanticSplitter } from './semantic';

export function getChunkingStrategy(
  name: ChunkingStrategy,
  deps: { embeddings: EmbeddingService },
): SmartTextSplitter {
  switch (name) {
    case 'document-aware':
      return documentAwareSplitter;
    case 'recursive-adaptive':
      return adaptiveRecursiveSplitter;
    case 'semantic':
      return makeSemanticSplitter(deps.embeddings);
    default: {
      const _exhaustive: never = name;
      throw new Error(`Unknown chunking strategy: ${String(_exhaustive)}`);
    }
  }
}
