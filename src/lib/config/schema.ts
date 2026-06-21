// Re-export shim — the canonical home for this schema is
// packages/domain/src/app-config.ts. Existing imports of
// '@/lib/config/schema' continue to work; new code should
// import from '@app/domain' directly.
export {
  toneSchema,
  outOfScopeTopicSchema,
  appConfigSchema,
  DEFAULT_APP_CONFIG,
  type Tone,
  type OutOfScopeTopic,
  type AppConfig,
} from '@app/domain/app-config';
