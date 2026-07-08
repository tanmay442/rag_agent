import { Config, Effect } from "effect";
import { EnvConfig } from "@app/domain";
import { EnvConfigLive } from "@app/infrastructure";

/**
 * Validate required environment variables at server startup using
 * Effect's `Config`.
 *
 * The infrastructure config (provider keys, blob storage, QStash, etc.) is
 * loaded by the `EnvConfig` service via `EnvConfigLive`, which already uses
 * Effect `Config.string` / `Config.option` for every env-derived value. On
 * top of that we require the core Clerk/DB vars that are needed by every
 * deployment. If any required variable is missing, Effect's `Config` throws
 * and we re-throw so the caller can abort startup (e.g. `process.exit(1)`).
 *
 * This replaces the previous Zod-based `validateEnv` + `ENV_VARS` spec. No
 * `process.env` reads happen outside of the `EnvConfig` layer.
 */
export async function validateEnv(): Promise<void> {
  await Effect.runPromise(
    Effect.gen(function* () {
      // Core vars required by every deployment.
      yield* Config.string("DATABASE_URL");
      yield* Config.string("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY");
      yield* Config.string("CLERK_SECRET_KEY");
      // Building EnvConfig validates the remaining provider-derived config.
      yield* EnvConfig;
    }).pipe(Effect.provide(EnvConfigLive)),
  );
}
