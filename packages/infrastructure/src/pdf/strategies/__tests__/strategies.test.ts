import { describe, it, expect, vi } from 'vitest';
import { getChunkingStrategy } from '../index';
import type { ParsedDocument, EmbeddingService, SplitChunk } from '@app/domain';

function assertMonotonic(chunks: SplitChunk[]) {
  expect(chunks.length).toBeGreaterThan(0);
  chunks.forEach((c, i) => {
    expect(c.content).toBeTruthy();
    expect(c.metadata).toBeDefined();
    expect(c.metadata.chunkIndex).toBe(i);
  });
}

describe('getChunkingStrategy - document-aware', () => {
  it('preserves page number and captures heading sections', async () => {
    const embeddings: EmbeddingService = { embed: vi.fn(), embedBatch: vi.fn() };
    const splitter = getChunkingStrategy('document-aware', { embeddings });
    const doc: ParsedDocument = {
      text: 'INTRODUCTION:\nThis is the first page. It has content.\nMETHODS:\nThis is the second page. More content here.',
      pages: [
        { page: 1, text: 'INTRODUCTION:\nThis is the first page. It has content.' },
        { page: 2, text: 'METHODS:\nThis is the second page. More content here.' },
      ],
    };
    const chunks = await splitter.splitDocument(doc, { docTitle: 'Doc', embeddings });
    assertMonotonic(chunks);
    expect(chunks[0].metadata.page).toBe(1);
    expect(chunks[0].metadata.section).toBe('INTRODUCTION:');
    expect(chunks[1].metadata.page).toBe(2);
    expect(chunks[1].metadata.section).toBe('METHODS:');
  });
});

describe('getChunkingStrategy - recursive-adaptive', () => {
  it('produces chunks without page/section metadata', async () => {
    const embeddings: EmbeddingService = { embed: vi.fn(), embedBatch: vi.fn() };
    const splitter = getChunkingStrategy('recursive-adaptive', { embeddings });
    const doc: ParsedDocument = {
      text: 'Para one text here that is reasonably long.\n\nPara two text here that is reasonably long.\n\nPara three text here that is reasonably long.',
      pages: [],
    };
    const chunks = await splitter.splitDocument(doc, { docTitle: 'Doc', embeddings });
    assertMonotonic(chunks);
    for (const c of chunks) {
      expect(c.metadata.page).toBeUndefined();
      expect(c.metadata.section).toBeUndefined();
      expect(c.content.length).toBeGreaterThan(0);
      expect(c.content.length).toBeLessThan(2000);
    }
  });
});

describe('getChunkingStrategy - semantic', () => {
  it('calls embedBatch once and attaches pooled embeddings to each chunk', async () => {
    const embedBatch = vi.fn().mockImplementation((s: string[]) =>
      Promise.resolve(s.map(() => [0.1, 0.2, 0.3])),
    );
    const embeddings: EmbeddingService = { embed: vi.fn(), embedBatch };
    const splitter = getChunkingStrategy('semantic', { embeddings });
    const doc: ParsedDocument = {
      text: 'First sentence here. Second sentence here. Third sentence here. Fourth sentence here.',
      pages: [],
    };
    const chunks = await splitter.splitDocument(doc, { docTitle: 'Doc', embeddings });
    assertMonotonic(chunks);
    expect(embedBatch).toHaveBeenCalledTimes(1);
    for (const c of chunks) {
      expect(c.embedding).toBeDefined();
    }
  });
});
