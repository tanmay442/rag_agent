import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

const { execFileSyncMock, spawnSyncMock } = vi.hoisted(() => ({
  execFileSyncMock: vi.fn(),
  spawnSyncMock: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  default: { execFileSync: execFileSyncMock, spawnSync: spawnSyncMock },
  execFileSync: execFileSyncMock,
  spawnSync: spawnSyncMock,
}));

vi.mock('dotenv/config', () => ({}));

import { main as runSetup } from './setup-test-db';

beforeEach(() => {
  fetchMock.mockReset();
  execFileSyncMock.mockReset();
  spawnSyncMock.mockReset();
});

describe('setup-test-db', () => {
  it('skips cleanly when NEON_API_KEY is not set', async () => {
    const origApiKey = process.env.NEON_API_KEY;
    const origProject = process.env.NEON_PROJECT_ID;
    delete process.env.NEON_API_KEY;
    delete process.env.NEON_PROJECT_ID;
    try {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await runSetup();
      expect(warnSpy).toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    } finally {
      if (origApiKey) process.env.NEON_API_KEY = origApiKey;
      if (origProject) process.env.NEON_PROJECT_ID = origProject;
    }
  });

  it('reuses an existing branch and writes DATABASE_URL into .env.test', async () => {
    process.env.NEON_PROJECT_ID = 'proj-1';
    process.env.NEON_API_KEY = 'key-1';
    process.env.NEON_TEST_BRANCH = 'dev-test';

    // 1. List returns the branch already.
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => '',
      json: async () => ({ branches: [{ id: 'br-1', name: 'dev-test' }] }),
    });
    // 2. Connection string fetch.
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => '',
      json: async () => ({ connection_string: 'postgres://u:p@host/db?sslmode=require' }),
    });
    execFileSyncMock.mockReturnValueOnce(Buffer.from(''));
    spawnSyncMock.mockReturnValueOnce({ status: 0 } as never);

    await runSetup();
    expect(execFileSyncMock).toHaveBeenCalledWith(
      'pnpm',
      ['db:push'],
      expect.objectContaining({ stdio: 'inherit' }),
    );
    expect(spawnSyncMock).toHaveBeenCalledWith(
      'pnpm',
      ['seed'],
      expect.objectContaining({ env: expect.objectContaining({ DATABASE_URL: expect.stringContaining('postgres://') }) }),
    );
  });
});
