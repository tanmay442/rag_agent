import { Effect, Logger, LogLevel } from "effect";

/**
 * App-wide structured logger built on Effect's `Logger`.
 *
 * The previous custom logger (console + manual JSON.stringify) is replaced
 * by Effect's `Logger`. `AppLogger` is a `Layer` that overrides the default
 * logger with a JSON formatter. Non-Effect runtime contexts (Next.js route
 * handlers, server actions) log through the `logger` facade below, which runs
 * the underlying Effect log inside a minimal runtime scoped to `AppLogger`.
 */

function safeStringify(value: unknown): string {
  if (value instanceof Error) {
    const out: Record<string, unknown> = { message: value.message };
    if (value.stack) out.stack = value.stack;
    const code = (value as { code?: unknown }).code;
    if (code !== undefined) out.code = code;
    return JSON.stringify(out);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function formatMessage(message: unknown): string {
  if (Array.isArray(message)) {
    return message
      .map((m) => (typeof m === "string" ? m : safeStringify(m)))
      .join(" ");
  }
  return typeof message === "string" ? message : safeStringify(message);
}

/** Structured JSON logger layer. */
export const AppLogger = Logger.replace(
  Logger.defaultLogger,
  Logger.make((options) => {
    const entry: Record<string, unknown> = {
      level: options.logLevel.label,
      time: options.date.toISOString(),
      msg: formatMessage(options.message),
    };
    if (options.cause._tag !== "Empty") {
      entry.cause = safeStringify(options.cause);
    }
    const line = JSON.stringify(entry);
    if (options.logLevel === LogLevel.Error) console.error(line);
    else if (options.logLevel === LogLevel.Warning) console.warn(line);
    else console.log(line);
  }),
);

type Meta = Record<string, unknown> | undefined;

function runLog(
  level: "info" | "warn" | "error" | "debug",
  message: string,
  meta?: Meta,
): void {
  const args: Array<unknown> = [message];
  if (meta && Object.keys(meta).length > 0) args.push(meta);

  const effect: Effect.Effect<void> =
    level === "error"
      ? Effect.logError(...args)
      : level === "warn"
        ? Effect.logWarning(...args)
        : level === "debug"
          ? Effect.logDebug(...args)
          : Effect.logInfo(...args);

  Effect.runSync(Effect.provide(effect, AppLogger));
}

/** Logging facade for non-Effect (synchronous/runtime) contexts. */
export const logger = {
  info: (msg: string, meta?: Meta) => runLog("info", msg, meta),
  warn: (msg: string, meta?: Meta) => runLog("warn", msg, meta),
  error: (msg: string, meta?: Meta) => runLog("error", msg, meta),
  debug: (msg: string, meta?: Meta) => runLog("debug", msg, meta),
};
