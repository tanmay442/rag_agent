import { describe, it, expect } from 'vitest';
import {
  appConfigSchema,
  DEFAULT_APP_CONFIG,
  type AppConfig,
} from './schema';

describe('appConfigSchema', () => {
  it('parses an empty object using all defaults', () => {
    const parsed = appConfigSchema.parse({});
    expect(parsed.orgName).toBe('Pulsar Analytics');
    expect(parsed.orgShortName).toBe('Pulsar Support');
    expect(parsed.audience).toBe('Pulsar Analytics customers and prospects');
    expect(parsed.agentPersona.tone).toBe('friendly');
    expect(parsed.agentPersona.name).toBe('Astra');
    expect(parsed.adminEmails).toEqual([]);
    expect(parsed.outOfScopeTopics.length).toBeGreaterThan(0);
    expect(parsed.branding.title).toBe('Pulsar Support');
    expect(parsed.seedDocsDir).toBe('./documents');
    // The pre-fetch toggle is OFF by default — the model is
    // expected to call searchDocumentation itself every turn.
    expect(parsed.prefetchFirstTurn).toBe(false);
  });

  it('exports a frozen-looking DEFAULT_APP_CONFIG', () => {
    expect(DEFAULT_APP_CONFIG.orgName).toBeTruthy();
    expect(DEFAULT_APP_CONFIG.agentPersona.tone).toBe('friendly');
    expect(DEFAULT_APP_CONFIG.prefetchFirstTurn).toBe(false);
  });

  it('rejects empty orgName', () => {
    const result = appConfigSchema.safeParse({ orgName: '' });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid email in adminEmails', () => {
    const result = appConfigSchema.safeParse({ adminEmails: ['not-an-email'] });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown tone', () => {
    const result = appConfigSchema.safeParse({
      agentPersona: { tone: 'sarcastic' as never },
    });
    expect(result.success).toBe(false);
  });

  it('preserves custom outOfScopeTopics', () => {
    const custom: Partial<AppConfig> = {
      outOfScopeTopics: [
        { topic: 'refund negotiation', handling: 'Open billing-dispute ticket.' },
      ],
    };
    const parsed = appConfigSchema.parse(custom);
    expect(parsed.outOfScopeTopics).toEqual([
      { topic: 'refund negotiation', handling: 'Open billing-dispute ticket.' },
    ]);
  });

  it('parses boolean prefetchFirstTurn=true when explicitly set', () => {
    const parsed = appConfigSchema.parse({ prefetchFirstTurn: true });
    expect(parsed.prefetchFirstTurn).toBe(true);
  });

  it('defaults the agent persona name to "Astra" for Pulsar', () => {
    const parsed = appConfigSchema.parse({});
    expect(parsed.agentPersona.name).toBe('Astra');
  });
});
