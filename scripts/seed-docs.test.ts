import { describe, it, expect, vi, beforeEach } from 'vitest';

const { ingestFileMock } = vi.hoisted(() => ({ ingestFileMock: vi.fn() }));

vi.mock('../src/lib/rag/ingest', () => ({
  ingestFile: ingestFileMock,
}));

// We mock dotenv so importing the script (which calls `import 'dotenv/config'`)
// does not try to read the host's .env files.
vi.mock('dotenv/config', () => ({}));

import { runSeed, parseArgs } from './seed-docs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, 'fixtures');

beforeEach(() => {
  ingestFileMock.mockReset();
});

describe('seed-docs', () => {
  it('passes every fixture PDF to ingestFile and prints status', async () => {
    // The fixtures dir contains a small set of portal PDFs (sample
    // handbook plus topical guides). Mock one ingestFile response
    // per file; the last mock wins but we only care about call
    // count + the first call's shape.
    const fixtureNames = [
      'sample.pdf',
      'admissions.pdf',
      'exams-and-grading.pdf',
      'co-curricular.pdf',
      'parent-portal-guide.pdf',
    ];
    for (let i = 0; i < fixtureNames.length; i++) {
      ingestFileMock.mockResolvedValueOnce({
        documentId: i + 1,
        chunks: 3,
        status: 'inserted',
      });
    }

    const logs: string[] = [];
    const original = console.log;
    console.log = (...args) => logs.push(args.join(' '));
    try {
      await runSeed({ fixturesDir: FIXTURES });
    } finally {
      console.log = original;
    }

    expect(ingestFileMock).toHaveBeenCalledTimes(fixtureNames.length);
    const arg = ingestFileMock.mock.calls[0]?.[0] as {
      fileName: string;
      buffer: Buffer;
      uploadedBy: string;
    };
    expect(fixtureNames).toContain(arg.fileName);
    expect(arg.buffer.length).toBeGreaterThan(0);
    expect(arg.buffer.slice(0, 4).toString('utf8')).toBe('%PDF');
    expect(arg.uploadedBy).toBe('seed-script');
    expect(logs.join('\n')).toMatch(/sample\.pdf: status=inserted/);
  });

  it('passes a custom userId when given via opts', async () => {
    for (let i = 0; i < 5; i++) {
      ingestFileMock.mockResolvedValueOnce({
        documentId: i + 1,
        chunks: 1,
        status: 'unchanged',
      });
    }
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

describe('parseArgs', () => {
  it('defaults to ./documents when no flag is given', () => {
    expect(parseArgs([])).toEqual({ dir: './documents', userId: undefined });
  });

  it('reads --dir=VALUE', () => {
    expect(parseArgs(['--dir=./x'])).toEqual({ dir: './x', userId: undefined });
  });

  it('reads --dir VALUE (space-separated form)', () => {
    expect(parseArgs(['--dir', './x'])).toEqual({ dir: './x', userId: undefined });
  });

  it('treats a trailing --dir with no value as the default', () => {
    expect(parseArgs(['--dir'])).toEqual({ dir: './documents', userId: undefined });
  });

  it('does not consume a flag-looking value after --dir', () => {
    expect(parseArgs(['--dir', '--something'])).toEqual({
      dir: './documents',
      userId: undefined,
    });
  });

  it('captures a positional userId after --dir=VALUE', () => {
    expect(parseArgs(['--dir=./x', 'admin-1'])).toEqual({
      dir: './x',
      userId: 'admin-1',
    });
  });

  it('falls back to SEED_DOCS_DIR when --dir is absent', () => {
    const prev = process.env.SEED_DOCS_DIR;
    process.env.SEED_DOCS_DIR = './from-env';
    try {
      expect(parseArgs([])).toEqual({ dir: './from-env', userId: undefined });
    } finally {
      if (prev === undefined) delete process.env.SEED_DOCS_DIR;
      else process.env.SEED_DOCS_DIR = prev;
    }
  });
});
