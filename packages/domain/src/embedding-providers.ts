export interface EmbeddingProviderDef {
  id: string;
  label: string;
  provider: 'google' | 'openai';
  model: string;
  defaultDimension: number;
  envVar: string;
}

export const EMBEDDING_PROVIDERS: EmbeddingProviderDef[] = [
  { id: 'gemini', label: 'Google Gemini Embedding', provider: 'google', model: 'gemini-embedding-001', defaultDimension: 768, envVar: 'AI_STUDIO_KEY' },
  { id: 'openai-small', label: 'OpenAI text-embedding-3-small', provider: 'openai', model: 'text-embedding-3-small', defaultDimension: 1536, envVar: 'OPENAI_API_KEY' },
  { id: 'openai-large', label: 'OpenAI text-embedding-3-large', provider: 'openai', model: 'text-embedding-3-large', defaultDimension: 3072, envVar: 'OPENAI_API_KEY' },
];

export function getProviderDef(id: string): EmbeddingProviderDef {
  const def = EMBEDDING_PROVIDERS.find((p) => p.id === id);
  if (!def) throw new Error(`Unknown embedding provider: ${id}`);
  return def;
}

export function getActiveDimension(): number {
  const id = process.env.EMBEDDING_PROVIDER ?? 'gemini';
  return getProviderDef(id).defaultDimension;
}
