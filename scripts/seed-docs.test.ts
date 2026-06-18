import { describe, it, expect, vi, beforeEach } from 'vitest';

const { ingestFileMock } = vi.hoisted(() => ({ ingestFileMock: vi.fn() }));

vi.mock('../src/lib/rag/ingest', () => ({
  ingestFile: ingestFileMock,
}));

// We mock dotenv so importing the script (which calls `import 'dotenv/config'`)
// does not try to read the host's .env files.
vi.mock('dotenv/config', () => ({}));

import { runSeed } from './seed-docs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, 'fixtures');

beforeEach(() => {
  ingestFileMock.mockReset();
});

describe('seed-docs', () => {
  it('passes the fixture PDF to ingestFile and prints status', async () => {
    ingestFileMock.mockResolvedValueOnce({
      documentId: 7,
      chunks: 11,
      status: 'inserted',
    });

    const logs: string[] = [];
    const original = console.log;
    console.log = (...args) => logs.push(args.join(' '));
    try {
      await runSeed({ fixturesDir: FIXTURES });
    } finally {
      console.log = original;
    }

    expect(ingestFileMock).toHaveBeenCalledTimes(1);
    const arg = ingestFileMock.mock.calls[0]?.[0] as {
      fileName: string;
      buffer: Buffer;
      uploadedBy: string;
    };
    expect(arg.fileName).toBe('sample.pdf');
    expect(arg.buffer.length).toBeGreaterThan(0);
    expect(arg.buffer.slice(0, 4).toString('utf8')).toBe('%PDF');
    expect(arg.uploadedBy).toBe('seed-script');
    expect(logs.join('\n')).toMatch(/sample\.pdf: status=inserted/);
  });

  it('passes a custom userId when given via opts', async () => {
    ingestFileMock.mockResolvedValueOnce({
      documentId: 1,
      chunks: 1,
      status: 'unchanged',
    });
    await runSeed({ fixturesDir: FIXTURES, userId: 'admin-user-1' });
    const arg = ingestFileMock.mock.calls[0]?.[0] as { uploadedBy: string };
    expect(arg.uploadedBy).toBe('admin-user-1');
  });

  it('exits with an error when no fixtures are present', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);
    await expect(
      runSeed({ fixturesDir: join(HERE, 'does-not-exist') }),
    ).rejects.toThrow('exit:1');
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
    exitSpy.mockRestore();
  });
});
