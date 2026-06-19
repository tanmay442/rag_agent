import { describe, it, expect } from 'vitest';
import {
  appConfigSchema,
  DEFAULT_APP_CONFIG,
  type AppConfig,
} from './schema';

describe('appConfigSchema', () => {
  it('parses an empty object using all defaults', () => {
    const parsed = appConfigSchema.parse({});
    expect(parsed.orgName).toBe('Gardenia Public School');
    expect(parsed.orgShortName).toBe('RAG Support');
    expect(parsed.audience).toBe('parents and students');
    expect(parsed.agentPersona.tone).toBe('friendly');
    expect(parsed.agentPersona.name).toBeUndefined();
    expect(parsed.adminEmails).toEqual([]);
    expect(parsed.outOfScopeTopics.length).toBeGreaterThan(0);
    expect(parsed.branding.title).toBe('RAG Support');
    expect(parsed.seedDocsDir).toBe('./documents');
    expect(parsed.prefetchFirstTurn).toBe(true);
  });

  it('exports a frozen-looking DEFAULT_APP_CONFIG', () => {
    expect(DEFAULT_APP_CONFIG.orgName).toBeTruthy();
    expect(DEFAULT_APP_CONFIG.agentPersona.tone).toBe('friendly');
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
        { topic: 'fee negotiation', handling: 'Refer to accounts office.' },
      ],
    };
    const parsed = appConfigSchema.parse(custom);
    expect(parsed.outOfScopeTopics).toEqual([
      { topic: 'fee negotiation', handling: 'Refer to accounts office.' },
    ]);
  });

  it('parses boolean prefetchFirstTurn=false', () => {
    const parsed = appConfigSchema.parse({ prefetchFirstTurn: false });
    expect(parsed.prefetchFirstTurn).toBe(false);
  });
});
