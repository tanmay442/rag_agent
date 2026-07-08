// Use-case: record chat queries and read the top list.
import { Effect } from 'effect';
import { QueryStats } from '@app/domain';

export const recordQuery = Effect.fn('QueryStats.recordQuery')(
  function* (userId: string, query: string) {
    const stats = yield* QueryStats;
    yield* stats.record(userId, query);
  },
);

export const getTopQueries = Effect.fn('QueryStats.getTopQueries')(
  function* (limit: number) {
    const stats = yield* QueryStats;
    return yield* stats.top(limit);
  },
);
