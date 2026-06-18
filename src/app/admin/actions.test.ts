import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getSessionMock, ingestFileMock, forbiddenMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  ingestFileMock: vi.fn(),
  forbiddenMock: vi.fn(),
}));

vi.mock('@/lib/auth/server', () => ({
  getSession: getSessionMock,
}));

vi.mock('@/lib/rag/ingest', () => ({
  ingestFile: ingestFileMock,
}));

vi.mock('next/navigation', () => ({
  forbidden: forbiddenMock,
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

import { uploadPdfAction } from './actions';

beforeEach(() => {
  getSessionMock.mockReset();
  ingestFileMock.mockReset();
  forbiddenMock.mockReset();
  // forbidden() throws a sentinel error so callers can't fall through.
  forbiddenMock.mockImplementation(() => {
    const err = new Error('NEXT_FORBIDDEN');
    (err as { __isForbidden?: boolean }).__isForbidden = true;
    throw err;
  });
});

function makeFormData(fields: Record<string, string | File>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    fd.append(k, v);
  }
  return fd;
}

function makeFile(name: string, content = 'pdf bytes'): File {
  return new File([content], name, { type: 'application/pdf' });
}

describe('uploadPdfAction', () => {
  it('rejects non-admin sessions by calling forbidden()', async () => {
    getSessionMock.mockResolvedValueOnce(null);
    await expect(
      uploadPdfAction({}, makeFormData({ file: makeFile('a.pdf') })),
    ).rejects.toThrow('NEXT_FORBIDDEN');
    expect(forbiddenMock).toHaveBeenCalledTimes(1);
    expect(ingestFileMock).not.toHaveBeenCalled();
  });

  it('rejects signed-in non-admin users', async () => {
    getSessionMock.mockResolvedValueOnce({
      user: { id: 'u1', email: 'u@b.test', name: 'U', role: 'user' },
      session: { id: 's1', userId: 'u1', expiresAt: '2030' },
    });
    await expect(
      uploadPdfAction({}, makeFormData({ file: makeFile('a.pdf') })),
    ).rejects.toThrow('NEXT_FORBIDDEN');
    expect(ingestFileMock).not.toHaveBeenCalled();
  });

  it('returns an error when no file is provided', async () => {
    getSessionMock.mockResolvedValueOnce({
      user: { id: 'admin-1', email: 'a@b.test', name: 'A', role: 'admin' },
      session: { id: 's1', userId: 'admin-1', expiresAt: '2030' },
    });
    const state = await uploadPdfAction({}, new FormData());
    expect(state.error).toMatch(/no pdf/i);
  });

  it('rejects non-PDF file names', async () => {
    getSessionMock.mockResolvedValueOnce({
      user: { id: 'admin-1', email: 'a@b.test', name: 'A', role: 'admin' },
      session: { id: 's1', userId: 'admin-1', expiresAt: '2030' },
    });
    const state = await uploadPdfAction({}, makeFormData({ file: makeFile('a.txt') }));
    expect(state.error).toMatch(/only pdf/i);
  });

  it('ingests the file when the admin uploads a PDF', async () => {
    getSessionMock.mockResolvedValueOnce({
      user: { id: 'admin-1', email: 'a@b.test', name: 'A', role: 'admin' },
      session: { id: 's1', userId: 'admin-1', expiresAt: '2030' },
    });
    ingestFileMock.mockResolvedValueOnce({
      documentId: 1,
      chunks: 7,
      status: 'inserted',
    });
    const state = await uploadPdfAction({}, makeFormData({ file: makeFile('policy.pdf') }));
    expect(ingestFileMock).toHaveBeenCalledTimes(1);
    expect(ingestFileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        fileName: 'policy.pdf',
        uploadedBy: 'admin-1',
      }),
    );
    expect(state.status).toBe('inserted');
    expect(state.chunks).toBe(7);
  });

  it('surfaces ingest errors', async () => {
    getSessionMock.mockResolvedValueOnce({
      user: { id: 'admin-1', email: 'a@b.test', name: 'A', role: 'admin' },
      session: { id: 's1', userId: 'admin-1', expiresAt: '2030' },
    });
    ingestFileMock.mockRejectedValueOnce(new Error('db down'));
    const state = await uploadPdfAction({}, makeFormData({ file: makeFile('policy.pdf') }));
    expect(state.error).toMatch(/db down/i);
  });
});
