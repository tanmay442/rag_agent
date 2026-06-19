import { describe, it, expect } from 'vitest';
import { appConfigSchema } from '@/lib/config/schema';
import { buildSystemPrompt } from './build-system-prompt';
import type { RetrievedChunk } from '@/lib/rag/search';

const baseConfig = appConfigSchema.parse({});

describe('buildSystemPrompt', () => {
  it('embeds the org name and audience in the persona block', () => {
    const prompt = buildSystemPrompt(
      { ...baseConfig, orgName: 'Acme Corp', audience: 'enterprise customers' },
      null,
    );
    expect(prompt).toContain('Acme Corp');
    expect(prompt).toContain('enterprise customers');
  });

  it('always includes the tool-contract block (searchDocumentation / createSupportTicket rules)', () => {
    const prompt = buildSystemPrompt(baseConfig, null);
    expect(prompt).toContain('searchDocumentation');
    expect(prompt).toContain('createSupportTicket');
    expect(prompt).toContain('How to navigate a conversation');
  });

  it('renders the out-of-scope bullets from the config', () => {
    const prompt = buildSystemPrompt(
      {
        ...baseConfig,
        outOfScopeTopics: [
          { topic: 'fee negotiation', handling: 'Refer to accounts office.' },
        ],
      },
      null,
    );
    expect(prompt).toContain('fee negotiation');
    expect(prompt).toContain('Refer to accounts office.');
  });

  it('omits the custom-instructions block when blank', () => {
    const prompt = buildSystemPrompt({ ...baseConfig, customInstructions: undefined }, null);
    expect(prompt).not.toContain('Additional instructions');
  });

  it('renders the custom-instructions block when set', () => {
    const prompt = buildSystemPrompt(
      { ...baseConfig, customInstructions: 'Always sign off as — The Front Office' },
      null,
    );
    expect(prompt).toContain('Additional instructions');
    expect(prompt).toContain('Always sign off as — The Front Office');
  });

  it('appends pre-fetched chunks on the first turn', () => {
    const chunks: RetrievedChunk[] = [
      { content: 'Tuition is $5000 per term.', similarity: 0.92 },
    ];
    const prompt = buildSystemPrompt(baseConfig, chunks);
    expect(prompt).toContain('Pre-fetched documentation');
    expect(prompt).toContain('Tuition is $5000 per term.');
  });

  it('does not append pre-fetched chunks when none are provided', () => {
    const prompt = buildSystemPrompt(baseConfig, null);
    expect(prompt).not.toContain('Pre-fetched documentation');
  });

  it('switches tone rule based on agentPersona.tone', () => {
    const friendly = buildSystemPrompt(
      { ...baseConfig, agentPersona: { ...baseConfig.agentPersona, tone: 'friendly' } },
      null,
    );
    const formal = buildSystemPrompt(
      { ...baseConfig, agentPersona: { ...baseConfig.agentPersona, tone: 'formal' } },
      null,
    );
    expect(friendly).toContain('Friendly, calm, and direct.');
    expect(formal).toContain('Polite, measured, and professional.');
  });

  it('mentions the agent name when provided', () => {
    const prompt = buildSystemPrompt(
      { ...baseConfig, agentPersona: { ...baseConfig.agentPersona, name: 'Aria' } },
      null,
    );
    expect(prompt).toContain('Your name is Aria.');
  });
});
