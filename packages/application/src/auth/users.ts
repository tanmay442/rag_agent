import { Effect } from 'effect';
import { Users, Audit, NotFoundError, ValidationError } from '@app/domain';
import { MAX_LIST_LIMIT } from '../../../../config/constants';
import { sanitizePagination } from '../pagination';

export const listUsers = Effect.fn('Auth.listUsers')(
  function* (input: { search?: string; limit?: number; offset?: number }) {
    const users = yield* Users;
    const { limit, offset } = sanitizePagination(input.limit, input.offset, MAX_LIST_LIMIT);
    const r = yield* users.list({ search: input.search, limit, offset });
    return { users: r.rows, total: r.total };
  },
);

export const setUserRole = Effect.fn('Auth.setUserRole')(
  function* (input: { clerkUserId: string; role: 'admin' | 'user'; actorId: string }) {
    if (input.role !== 'admin' && input.role !== 'user') {
      return yield* new ValidationError(`Invalid role: ${input.role}`);
    }
    const users = yield* Users;
    const audit = yield* Audit;
    const row = yield* users.setRole(input.clerkUserId, input.role);
    if (!row) return yield* new NotFoundError(`User not found: ${input.clerkUserId}`);
    // Clerk role sync is best-effort.
    yield* users
      .syncClerkRole(input.clerkUserId, input.role)
      .pipe(Effect.catchAll((e) => Effect.sync(() => console.error(`Failed to sync Clerk role for ${input.clerkUserId}:`, e))));
    yield* audit
      .logTicketEvent({
        action: 'role_change',
        ticketId: `user:${input.clerkUserId}`,
        actorId: input.actorId,
      })
      .pipe(Effect.catchAll((e) => Effect.sync(() => console.error(`Failed to log role change audit for ${input.clerkUserId}:`, e))));
    return { user: { clerkUserId: row.clerkUserId, role: row.role } };
  },
);

export const getUserByClerkId = Effect.fn('Auth.getUserByClerkId')(
  function* (clerkUserId: string) {
    const users = yield* Users;
    const u = yield* users.findByClerkId(clerkUserId);
    return {
      user: u
        ? { clerkUserId: u.clerkUserId, email: u.email, name: u.name, role: u.role }
        : null,
    };
  },
);

export const touchLastSeen = Effect.fn('Auth.touchLastSeen')(
  function* (clerkUserId: string) {
    const users = yield* Users;
    yield* users.touchLastSeen(clerkUserId);
  },
);
