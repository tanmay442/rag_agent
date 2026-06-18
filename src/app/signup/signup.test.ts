import { describe, it, expect, vi, beforeEach } from 'vitest';

const { signUpMock, promoteToAdminMock } = vi.hoisted(() => ({
  signUpMock: vi.fn(),
  promoteToAdminMock: vi.fn(),
}));

vi.mock('@/lib/auth/client', () => ({
  authClient: {
    signUp: { email: signUpMock },
  },
}));

vi.mock('@/lib/auth/roleBootstrap', () => ({
  isAdminEmail: (email: string) => {
    const allow = (process.env.ADMIN_EMAILS ?? '').split(',').map((s) => s.trim().toLowerCase());
    return allow.includes(email.trim().toLowerCase());
  },
  promoteToAdmin: promoteToAdminMock,
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    // Make redirect throw so we can assert it was called without
    // continuing past it.
    const err = new Error(`NEXT_REDIRECT:${url}`);
    (err as { __isRedirect?: boolean }).__isRedirect = true;
    throw err;
  }),
}));

import { signupAction } from './actions';

beforeEach(() => {
  signUpMock.mockReset();
  promoteToAdminMock.mockReset();
});

describe('signupAction', () => {
  it('returns an error when fields are missing', async () => {
    const form = new FormData();
    const state = await signupAction({}, form);
    expect(state.error).toMatch(/required/i);
    expect(signUpMock).not.toHaveBeenCalled();
  });

  it('returns an error when the auth SDK rejects', async () => {
    signUpMock.mockResolvedValueOnce({
      error: { message: 'Email already in use' },
      data: null,
    });
    const form = new FormData();
    form.set('name', 'A');
    form.set('email', 'a@b.test');
    form.set('password', 'password123');
    const state = await signupAction({}, form);
    expect(state.error).toMatch(/already in use/i);
    expect(promoteToAdminMock).not.toHaveBeenCalled();
  });

  it('redirects to /chat for non-admin users', async () => {
    signUpMock.mockResolvedValueOnce({
      error: null,
      data: { user: { id: 'u-1' }, session: { id: 's-1' } },
    });
    const form = new FormData();
    form.set('name', 'Regular');
    form.set('email', 'someone@example.com');
    form.set('password', 'password123');
    let caught: unknown;
    try {
      await signupAction({}, form);
    } catch (err) {
      caught = err;
    }
    expect((caught as { message?: string })?.message).toBe('NEXT_REDIRECT:/chat');
    expect(promoteToAdminMock).not.toHaveBeenCalled();
  });

  it('promotes the user to admin when their email is in ADMIN_EMAILS', async () => {
    process.env.ADMIN_EMAILS = 'vip@example.com, ceo@example.com';
    signUpMock.mockResolvedValueOnce({
      error: null,
      data: { user: { id: 'u-2' }, session: { id: 's-2' } },
    });
    promoteToAdminMock.mockResolvedValueOnce(undefined);
    const form = new FormData();
    form.set('name', 'VIP');
    form.set('email', 'vip@example.com');
    form.set('password', 'password123');
    let caught: unknown;
    try {
      await signupAction({}, form);
    } catch (err) {
      caught = err;
    }
    expect(promoteToAdminMock).toHaveBeenCalledTimes(1);
    expect(promoteToAdminMock).toHaveBeenCalledWith({
      userId: 'u-2',
      email: 'vip@example.com',
    });
    expect((caught as { message?: string })?.message).toBe('NEXT_REDIRECT:/chat');
    delete process.env.ADMIN_EMAILS;
  });

  it('still redirects even if promoteToAdmin throws', async () => {
    process.env.ADMIN_EMAILS = 'vip@example.com';
    signUpMock.mockResolvedValueOnce({
      error: null,
      data: { user: { id: 'u-3' }, session: { id: 's-3' } },
    });
    promoteToAdminMock.mockRejectedValueOnce(new Error('db down'));
    const form = new FormData();
    form.set('name', 'VIP');
    form.set('email', 'vip@example.com');
    form.set('password', 'password123');
    let caught: unknown;
    try {
      await signupAction({}, form);
    } catch (err) {
      caught = err;
    }
    expect((caught as { message?: string })?.message).toBe('NEXT_REDIRECT:/chat');
    delete process.env.ADMIN_EMAILS;
  });
});
