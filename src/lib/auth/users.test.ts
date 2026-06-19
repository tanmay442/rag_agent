import { describe, it, expect, vi, beforeEach } from 'vitest';

const usersTable: Array<{
  clerkUserId: string;
  email: string;
  name: string | null;
  imageUrl: string | null;
  role: 'admin' | 'user';
  lastSeenAt: Date | null;
  createdAt: Date;
}> = [];

type EqMarker = {
  __sqlPredicate: true;
  column: string;
  value: unknown;
};

function isEq(p: unknown): p is EqMarker {
  return (
    typeof p === 'object' &&
    p !== null &&
    (p as { __sqlPredicate?: unknown }).__sqlPredicate === true
  );
}

const SQL_TO_JS: Record<string, keyof typeof usersTable[number]> = {
  clerk_user_id: 'clerkUserId',
  email: 'email',
  name: 'name',
  image_url: 'imageUrl',
  role: 'role',
  last_seen_at: 'lastSeenAt',
  created_at: 'createdAt',
};

function sqlMatch(row: typeof usersTable[number], p: unknown): boolean {
  if (!p) return true;
  if (typeof p === 'function') {
    return (p as (r: typeof usersTable[number]) => boolean)(row);
  }
  if (isEq(p)) {
    const jsField = SQL_TO_JS[p.column] ?? (p.column as keyof typeof usersTable[number]);
    return (row as unknown as Record<string, unknown>)[jsField as string] === p.value;
  }
  return true;
}

const { eqSpy } = vi.hoisted(() => ({
  eqSpy: vi.fn((col: { name?: string } | unknown, value: unknown) => {
    const name = (col as { name?: string })?.name ?? 'unknown';
    return {
      __sqlPredicate: true as const,
      column: name,
      value,
    };
  }),
}));

vi.mock('drizzle-orm', async () => {
  const actual =
    await vi.importActual<typeof import('drizzle-orm')>('drizzle-orm');
  return {
    ...actual,
    eq: eqSpy,
  };
});

vi.mock('@/lib/db/client', () => {
  return {
    db: {
      insert: () => ({
        values: (v: {
          clerkUserId: string;
          email: string;
          name?: string | null;
          imageUrl?: string | null;
          role: 'admin' | 'user';
        }) => ({
          onConflictDoUpdate: (): unknown => ({
            returning: async () => {
              const existing = usersTable.find(
                (u) => u.clerkUserId === v.clerkUserId,
              );
              if (existing) {
                existing.email = v.email;
                existing.name = v.name ?? null;
                existing.imageUrl = v.imageUrl ?? null;
                existing.role = v.role;
                return [existing];
              }
              const row = {
                clerkUserId: v.clerkUserId,
                email: v.email,
                name: v.name ?? null,
                imageUrl: v.imageUrl ?? null,
                role: v.role,
                lastSeenAt: null,
                createdAt: new Date('2024-01-01T00:00:00Z'),
              };
              usersTable.push(row);
              return [row];
            },
          }),
        }),
      }),
      update: () => ({
        set: (patch: Partial<typeof usersTable[number]>) => ({
          where: (predicate: unknown) => ({
            returning: async () => {
              const row = usersTable.find((r) => sqlMatch(r, predicate));
              if (!row) return [];
              Object.assign(row, patch);
              return [row];
            },
          }),
        }),
      }),
      query: {
        users: {
          findFirst: async (opts: { where: unknown }) => {
            return (
              usersTable.find((r) => sqlMatch(r, opts.where)) ?? null
            );
          },
        },
      },
      select: () => ({
        from: () => ({
          where: (predicate: unknown) => {
            let capturedLimit: number | null = null;
            let capturedOffset = 0;
            return {
              orderBy: () => ({
                limit: (l: number) => {
                  capturedLimit = l;
                  return {
                    offset: async (o: number) => {
                      capturedOffset = o;
                      const filtered = usersTable.filter((r) =>
                        sqlMatch(r, predicate),
                      );
                      const start = capturedOffset;
                      const end =
                        capturedLimit !== null
                          ? start + capturedLimit
                          : filtered.length;
                      return filtered.slice(start, end);
                    },
                  };
                },
              }),
            };
          },
        }),

      }),
    },
  };
});

vi.mock('./audit', () => ({
  logTicketEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: () =>
    Promise.resolve({
      users: {
        updateUserMetadata: vi.fn().mockResolvedValue({}),
      },
    }),
}));

import {
  syncUserFromClerk,
  getUserByClerkId,
  listUsers,
  setUserRole,
  isAdminEmail,
} from './users';

beforeEach(() => {
  usersTable.length = 0;
  process.env.ADMIN_EMAILS = 'admin@example.com,owner@example.com';
  eqSpy.mockClear();
});

describe('isAdminEmail', () => {
  it('matches an email in the admin list (case-insensitive)', () => {
    expect(isAdminEmail('Admin@Example.com')).toBe(true);
  });
  it('rejects an email not in the admin list', () => {
    expect(isAdminEmail('user@example.com')).toBe(false);
  });
  it('handles null and empty inputs', () => {
    expect(isAdminEmail(null)).toBe(false);
    expect(isAdminEmail('')).toBe(false);
  });
});

describe('syncUserFromClerk', () => {
  it('inserts a new user with role=admin when email is in ADMIN_EMAILS', async () => {
    const u = await syncUserFromClerk({
      clerkUserId: 'user_admin',
      email: 'admin@example.com',
      name: 'Admin',
    });
    expect(u.role).toBe('admin');
    expect(u.email).toBe('admin@example.com');
  });

  it('inserts a new user with role=user when email is not in ADMIN_EMAILS', async () => {
    const u = await syncUserFromClerk({
      clerkUserId: 'user_normal',
      email: 'normal@example.com',
    });
    expect(u.role).toBe('user');
  });

  it('honors clerkRole when explicitly passed', async () => {
    const u = await syncUserFromClerk({
      clerkUserId: 'user_explicit',
      email: 'normal@example.com',
      clerkRole: 'admin',
    });
    expect(u.role).toBe('admin');
  });
});

describe('getUserByClerkId', () => {
  it('returns the local row when present', async () => {
    await syncUserFromClerk({
      clerkUserId: 'user_get',
      email: 'get@example.com',
    });
    const u = await getUserByClerkId('user_get');
    expect(u?.email).toBe('get@example.com');
  });

  it('returns null when no row exists', async () => {
    const u = await getUserByClerkId('missing');
    expect(u).toBeNull();
  });
});

describe('listUsers', () => {
  it('returns all users when no search is given', async () => {
    await syncUserFromClerk({ clerkUserId: 'a', email: 'a@example.com' });
    await syncUserFromClerk({ clerkUserId: 'b', email: 'b@example.com' });
    const r = await listUsers();
    expect(r.users).toHaveLength(2);
  });

  it('paginates with limit and offset', async () => {
    for (let i = 0; i < 5; i++) {
      await syncUserFromClerk({
        clerkUserId: `u${i}`,
        email: `u${i}@example.com`,
      });
    }
    const r = await listUsers({ limit: 2, offset: 1 });
    expect(r.users).toHaveLength(2);
  });
});

describe('setUserRole', () => {
  it('rejects invalid role values', async () => {
    await expect(
      // @ts-expect-error - testing runtime guard
      setUserRole('user_x', 'superuser', 'actor'),
    ).rejects.toThrow(/Invalid role/);
  });

  it('updates the role locally', async () => {
    await syncUserFromClerk({
      clerkUserId: 'user_role',
      email: 'role@example.com',
    });
    const updated = await setUserRole('user_role', 'admin', 'actor');
    expect(updated.role).toBe('admin');
    const reread = await getUserByClerkId('user_role');
    expect(reread?.role).toBe('admin');
  });
});
