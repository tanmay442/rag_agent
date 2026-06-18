import { describe, it, expect, vi, beforeEach } from 'vitest';

const { neonProxy, getSession } = vi.hoisted(() => ({
  neonProxy: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock('@/lib/auth/server', () => ({
  auth: {
    middleware: (config: { loginUrl?: string }) => {
      const impl = async (req: unknown) => {
        const url = (req as { nextUrl: { pathname: string } }).nextUrl.pathname;
        if (url === '/must-login') {
          return new Response(null, {
            status: 307,
            headers: { Location: config.loginUrl ?? '/login' },
          });
        }
        return new Response(null, { status: 200 });
      };
      neonProxy.mockImplementation(impl);
      return neonProxy;
    },
    getSession,
  },
}));

import { proxy } from './proxy';

function makeRequest(pathname: string): Parameters<typeof proxy>[0] {
  const url = new URL(`https://example.test${pathname}`);
  // jsdom's URL implementation doesn't include `clone`; polyfill it.
  (url as URL & { clone?: () => URL }).clone = function clone() {
    return new URL(url.toString());
  };
  return {
    nextUrl: url,
  } as unknown as Parameters<typeof proxy>[0];
}

beforeEach(() => {
  neonProxy.mockClear();
  getSession.mockReset();
});

describe('proxy', () => {
  it('delegates session handling to the neon auth middleware', async () => {
    getSession.mockResolvedValueOnce({ data: null });
    const req = makeRequest('/chat');
    const res = await proxy(req);
    expect(neonProxy).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
  });

  it('redirects anonymous users away from /admin', async () => {
    getSession.mockResolvedValueOnce({ data: null });
    const req = makeRequest('/admin/upload');
    const res = await proxy(req);
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.headers.get('Location')).toContain('/chat');
  });

  it('redirects non-admin users away from /admin', async () => {
    getSession.mockResolvedValueOnce({
      data: { user: { id: 'u1', role: 'user' }, session: {} },
    });
    const req = makeRequest('/admin/users');
    const res = await proxy(req);
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.headers.get('Location')).toContain('/chat');
  });

  it('lets admins through to /admin routes', async () => {
    getSession.mockResolvedValueOnce({
      data: { user: { id: 'u1', role: 'admin' }, session: {} },
    });
    const req = makeRequest('/admin/upload');
    const res = await proxy(req);
    expect(res.status).toBe(200);
  });

  it('passes through the SDK redirect when it returns one', async () => {
    getSession.mockResolvedValueOnce({ data: null });
    const req = makeRequest('/must-login');
    const res = await proxy(req);
    expect(res.status).toBe(307);
  });
});
