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
          { topic: 'refund negotiation', handling: 'Open billing-dispute ticket.' },
        ],
      },
      null,
    );
    expect(prompt).toContain('refund negotiation');
    expect(prompt).toContain('Open billing-dispute ticket.');
  });

  it('omits the custom-instructions block when blank', () => {
    const prompt = buildSystemPrompt({ ...baseConfig, customInstructions: undefined }, null);
    expect(prompt).not.toContain('Additional instructions');
  });

  it('renders the custom-instructions block when set', () => {
    const prompt = buildSystemPrompt(
      { ...baseConfig, customInstructions: 'Always sign off as \u2014 The Front Office' },
      null,
    );
    expect(prompt).toContain('Additional instructions');
    expect(prompt).toContain('Always sign off as \u2014 The Front Office');
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

  it('requires \`searchDocumentation\` to be called for product questions', () => {
    const prompt = buildSystemPrompt(baseConfig, null);
    expect(prompt).toMatch(/Always call .searchDocumentation. for any product/);
  });

  it('forbids \`searchDocumentation\` for non-product questions (security, legal, medical)', () => {
    const prompt = buildSystemPrompt(baseConfig, null);
    expect(prompt).toMatch(/Do NOT call .searchDocumentation. for non-product questions/);
  });

  it('mandates a citation snippet (\u2264 150 chars) and source file in the answer', () => {
    const prompt = buildSystemPrompt(baseConfig, null);
    expect(prompt).toContain('150 characters');
    expect(prompt).toMatch(/<source-file>\.pdf/);
  });

  it('opens a ticket automatically when RAG returns nothing useful', () => {
    const prompt = buildSystemPrompt(baseConfig, null);
    // Tool contract #5 must prescribe auto-ticket on empty search.
    // The wording is split across two bullet points inside the
    // same numbered list item, so we assert the two substrings
    // independently.
    expect(prompt).toContain('tool returns nothing useful');
    expect(prompt).toContain('Open a support ticket automatically');
  });

  it('prescribes the structured issue format (Product / Question / What was tried / User context)', () => {
    const prompt = buildSystemPrompt(baseConfig, null);
    expect(prompt).toMatch(/Product: .Starter \| Team \| Business \| Enterprise/);
    expect(prompt).toMatch(/Question: <what the user actually wanted to know>/);
    expect(prompt).toMatch(/What was tried: <the searches/);
    expect(prompt).toMatch(/User context: <workspace, role/);
  });

  it('truncates the \`issue\` field at 4 000 characters with an ellipsis', () => {
    const prompt = buildSystemPrompt(baseConfig, null);
    expect(prompt).toMatch(/truncate the `issue`[\s\S]*?4 000 characters/);
  });

  it('greets the user by name only on the first turn', () => {
    const prompt = buildSystemPrompt(baseConfig, null);
    expect(prompt).toMatch(/Greet the user by name/);
    expect(prompt).toMatch(/never on follow-up turns/);
  });

  it('does not append a pre-fetch block when given an empty array', () => {
    const prompt = buildSystemPrompt(baseConfig, []);
    expect(prompt).not.toContain('Pre-fetched documentation');
  });
});
