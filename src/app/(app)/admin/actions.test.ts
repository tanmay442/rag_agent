import { describe, it, expect, vi, beforeEach } from 'vitest';

const { requireAdminMock } = vi.hoisted(() => ({
  requireAdminMock: vi.fn(),
}));

const {
  uploadPdfMock,
  replacePdfMock,
  softDeleteDocumentMock,
  restoreDocumentMock,
  hardDeleteDocumentMock,
  recountChunksForDocumentMock,
  recountChunksForAllDocumentsMock,
  setUserRoleMock,
  updateTicketMock,
  logTicketEventMock,
  clerkClientMock,
  revalidatePathMock,
  redirectMock,
} = vi.hoisted(() => ({
  uploadPdfMock: vi.fn(),
  replacePdfMock: vi.fn(),
  softDeleteDocumentMock: vi.fn(),
  restoreDocumentMock: vi.fn(),
  hardDeleteDocumentMock: vi.fn(),
  recountChunksForDocumentMock: vi.fn(),
  recountChunksForAllDocumentsMock: vi.fn(),
  setUserRoleMock: vi.fn(),
  updateTicketMock: vi.fn(),
  logTicketEventMock: vi.fn(),
  clerkClientMock: vi.fn(),
  revalidatePathMock: vi.fn(),
  redirectMock: vi.fn(),
}));

vi.mock('@/composition', () => ({
  requireAdmin: requireAdminMock,
  requireSession: requireAdminMock,
  getAppSession: vi.fn(),
  ForbiddenError: class ForbiddenError extends Error {
    status = 403;
  },
  getComposition: () => ({
    uploadPdf: uploadPdfMock,
    replacePdf: replacePdfMock,
    softDeleteDocument: softDeleteDocumentMock,
    restoreDocument: restoreDocumentMock,
    hardDeleteDocument: hardDeleteDocumentMock,
    recountChunksForDocument: recountChunksForDocumentMock,
    recountChunksForAllDocuments: recountChunksForAllDocumentsMock,
    setUserRole: setUserRoleMock,
    updateTicket: updateTicketMock,
    logTicketEvent: logTicketEventMock,
  }),
}));

vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: clerkClientMock,
}));

vi.mock('next/cache', () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

import {
  uploadPdfAction,
  deleteDocumentAction,
  restoreDocumentAction,
  setRoleAction,
  updateTicketAction,
  impersonateUserAction,
  recountChunksAction,
  recountAllChunksAction,
} from './actions';

beforeEach(() => {
  requireAdminMock.mockReset();
  uploadPdfMock.mockReset();
  replacePdfMock.mockReset();
  softDeleteDocumentMock.mockReset();
  restoreDocumentMock.mockReset();
  hardDeleteDocumentMock.mockReset();
  recountChunksForDocumentMock.mockReset();
  recountChunksForAllDocumentsMock.mockReset();
  setUserRoleMock.mockReset();
  updateTicketMock.mockReset();
  clerkClientMock.mockReset();
  revalidatePathMock.mockReset();
  redirectMock.mockReset();
});

describe('admin actions', () => {
  it('uploadPdfAction 403s when requireAdmin throws', async () => {
    const forbiddenError = new Error('Forbidden') as Error & { status: number };
    forbiddenError.status = 403;
    requireAdminMock.mockRejectedValue(forbiddenError);
    const fd = new FormData();
    fd.append('file', new File(['x'], 'a.pdf', { type: 'application/pdf' }));
    const result = await uploadPdfAction({}, fd);
    expect(result.error).toBe('Forbidden');
    expect(uploadPdfMock).not.toHaveBeenCalled();
  });

  it('uploadPdfAction returns an error if no file is provided', async () => {
    requireAdminMock.mockResolvedValue({
      user: { id: 'admin_1', email: 'a@x.com', name: 'Admin', role: 'admin' },
    });
    const fd = new FormData();
    const result = await uploadPdfAction({}, fd);
    expect(result.error).toMatch(/No PDF/);
  });

  it('uploadPdfAction returns a success payload for a valid file', async () => {
    requireAdminMock.mockResolvedValue({
      user: { id: 'admin_1', email: 'a@x.com', name: 'Admin', role: 'admin' },
    });
    uploadPdfMock.mockResolvedValue({
      documentId: 7,
      status: 'inserted',
      chunks: 12,
    });
    const fd = new FormData();
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x20, 0x74, 0x65, 0x73, 0x74]);
    fd.append('file', new File([pdfBytes], 'a.pdf', { type: 'application/pdf' }));
    const result = await uploadPdfAction({}, fd);
    expect(result.status).toBe('inserted');
    expect(result.chunks).toBe(12);
    expect(result.documentId).toBe(7);
  });

  it('deleteDocumentAction delegates to softDeleteDocument', async () => {
    requireAdminMock.mockResolvedValue({
      user: { id: 'admin_1', email: 'a@x.com', name: 'Admin', role: 'admin' },
    });
    softDeleteDocumentMock.mockResolvedValue(undefined);
    const result = await deleteDocumentAction(42);
    expect(softDeleteDocumentMock).toHaveBeenCalledWith({ documentId: 42, actorId: 'admin_1' });
    expect(result).toEqual({});
  });

  it('deleteDocumentAction surfaces errors', async () => {
    requireAdminMock.mockResolvedValue({
      user: { id: 'admin_1', email: 'a@x.com', name: 'Admin', role: 'admin' },
    });
    softDeleteDocumentMock.mockRejectedValue(new Error('boom'));
    const result = await deleteDocumentAction(42);
    expect(result.error).toBe('An unexpected error occurred');
  });

  it('restoreDocumentAction surfaces non-ok reasons', async () => {
    requireAdminMock.mockResolvedValue({
      user: { id: 'admin_1', email: 'a@x.com', name: 'Admin', role: 'admin' },
    });
    restoreDocumentMock.mockResolvedValue({ ok: false, reason: 'expired' });
    const result = await restoreDocumentAction(42);
    expect(result.error).toContain('expired');
  });

  it('setRoleAction rejects invalid role values', async () => {
    requireAdminMock.mockResolvedValue({
      user: { id: 'admin_1', email: 'a@x.com', name: 'Admin', role: 'admin' },
    });
    const result = await setRoleAction('user_1', 'superuser' as 'admin');
    expect(result.error).toMatch(/Invalid role/);
    expect(setUserRoleMock).not.toHaveBeenCalled();
  });

  it('setRoleAction forwards valid roles to setUserRole', async () => {
    requireAdminMock.mockResolvedValue({
      user: { id: 'admin_1', email: 'a@x.com', name: 'Admin', role: 'admin' },
    });
    setUserRoleMock.mockResolvedValue({
      clerkUserId: 'user_1',
      role: 'admin',
    } as never);
    const result = await setRoleAction('user_1', 'admin');
    expect(setUserRoleMock).toHaveBeenCalledWith({ clerkUserId: 'user_1', role: 'admin', actorId: 'admin_1' });
    expect(result).toEqual({});
  });

  it('updateTicketAction surfaces non-ok results', async () => {
    requireAdminMock.mockResolvedValue({
      user: { id: 'admin_1', email: 'a@x.com', name: 'Admin', role: 'admin' },
    });
    updateTicketMock.mockResolvedValue({ ok: false, reason: 'invalid_transition' });
    const result = await updateTicketAction('TKT-1001', { status: 'closed' });
    expect(result.error).toContain('invalid_transition');
  });

  it('impersonateUserAction returns a Clerk sign-in URL', async () => {
    requireAdminMock.mockResolvedValue({
      user: { id: 'admin_1', email: 'a@x.com', name: 'Admin', role: 'admin' },
    });
    clerkClientMock.mockResolvedValue({
      signInTokens: {
        createSignInToken: vi
          .fn()
          .mockResolvedValue({ url: 'https://clerk.example/impersonate' }),
      },
    });
    const result = await impersonateUserAction('user_1');
    expect(result.url).toContain('clerk.example');
  });

  it('recountChunksAction 403s when requireAdmin throws', async () => {
    const forbiddenError = new Error('Forbidden') as Error & { status: number };
    forbiddenError.status = 403;
    requireAdminMock.mockRejectedValue(forbiddenError);
    const result = await recountChunksAction(42);
    expect(result.error).toBe('Forbidden');
    expect(recountChunksForDocumentMock).not.toHaveBeenCalled();
  });

  it('recountChunksAction returns the count and revalidates the path for an admin', async () => {
    requireAdminMock.mockResolvedValue({
      user: { id: 'admin_1', email: 'a@x.com', name: 'Admin', role: 'admin' },
    });
    recountChunksForDocumentMock.mockResolvedValue({ documentId: 42, count: 12 });
    const result = await recountChunksAction(42);
    expect(result).toEqual({ count: 12 });
    expect(recountChunksForDocumentMock).toHaveBeenCalledWith(42);
    expect(revalidatePathMock).toHaveBeenCalledWith('/admin/documents');
  });

  it('recountChunksAction surfaces errors thrown by the helper', async () => {
    requireAdminMock.mockResolvedValue({
      user: { id: 'admin_1', email: 'a@x.com', name: 'Admin', role: 'admin' },
    });
    recountChunksForDocumentMock.mockRejectedValue(new Error('db down'));
    const result = await recountChunksAction(42);
    expect(result.error).toBe('An unexpected error occurred');
  });

  it('recountAllChunksAction 403s when requireAdmin throws', async () => {
    const forbiddenError = new Error('Forbidden') as Error & { status: number };
    forbiddenError.status = 403;
    requireAdminMock.mockRejectedValue(forbiddenError);
    const result = await recountAllChunksAction();
    expect(result.error).toBe('Forbidden');
    expect(recountChunksForAllDocumentsMock).not.toHaveBeenCalled();
  });

  it('recountAllChunksAction returns summary numbers and revalidates the path for an admin', async () => {
    requireAdminMock.mockResolvedValue({
      user: { id: 'admin_1', email: 'a@x.com', name: 'Admin', role: 'admin' },
    });
    recountChunksForAllDocumentsMock.mockResolvedValue([
      { documentId: 1, count: 5 },
      { documentId: 2, count: 7 },
    ]);
    const result = await recountAllChunksAction();
    expect(result).toEqual({ documents: 2, total: 12 });
    expect(revalidatePathMock).toHaveBeenCalledWith('/admin/documents');
  });

  it('recountAllChunksAction surfaces errors thrown by the helper', async () => {
    requireAdminMock.mockResolvedValue({
      user: { id: 'admin_1', email: 'a@x.com', name: 'Admin', role: 'admin' },
    });
    recountChunksForAllDocumentsMock.mockRejectedValue(new Error('nope'));
    const result = await recountAllChunksAction();
    expect(result.error).toBe('An unexpected error occurred');
  });
});
