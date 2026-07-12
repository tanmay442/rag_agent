import type { Reranker, RerankCandidate } from '@app/domain';

const RRF_FALLBACK = (candidates: RerankCandidate[], topK: number): string[] =>
  candidates.slice(0, topK).map((c) => c.id);

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}

function parseRanking(raw: string, candidates: RerankCandidate[], topK: number): string[] | null {
  const text = raw.trim();
  try {
    const json = JSON.parse(text) as unknown;
    const arr = Array.isArray(json) ? json : null;
    if (!arr) return null;

    const ids: string[] = [];
    for (const item of arr) {
      if (typeof item === 'number') {
        const id = candidates[item]?.id;
        if (id && !ids.includes(id)) ids.push(id);
      } else if (typeof item === 'string') {
        // Accept either an id or a 1-based index string.
        const asNum = Number(item);
        const cand = Number.isInteger(asNum) ? candidates[asNum - 1]?.id ?? item : item;
        if (!ids.includes(cand)) ids.push(cand);
      } else if (item && typeof item === 'object') {
        const idx = (item as { index?: number; id?: string }).index;
        const cid = (item as { index?: number; id?: string }).id;
        const id = typeof cid === 'string' ? cid : candidates[idx as number]?.id;
        if (id && !ids.includes(id)) ids.push(id);
      }
    }
    return ids.length > 0 ? ids.slice(0, topK) : null;
  } catch {
    const matches = text.match(/"([^"]+)"|(\d+)/g);
    if (!matches) return null;
    const ids: string[] = [];
    for (const m of matches) {
      const cleaned = m.replace(/"/g, '');
      const asNum = Number(cleaned);
      const cand =
        Number.isInteger(asNum) && asNum > 0 ? candidates[asNum - 1]?.id ?? cleaned : cleaned;
      if (!ids.includes(cand)) ids.push(cand);
    }
    return ids.length > 0 ? ids.slice(0, topK) : null;
  }
}

function buildPrompt(query: string, candidates: RerankCandidate[]): string {
  const docs = candidates
    .map((c, i) => `[${i + 1}] ${c.content}`)
    .join('\n\n');
  return [
    'You are a search re-ranker. Given a query and a list of retrieved document passages,',
    'rank the passages by relevance to the query from most to least relevant.',
    'Respond with ONLY a JSON array of the passage identifiers in ranked order.',
    'Return the array as JSON ids (the bracketed labels like "[3]") if possible, otherwise 1-based indices.',
    '',
    `QUERY: ${query}`,
    '',
    'PASSAGES:',
    docs,
    '',
    'Respond with JSON only, for example: ["[3]","[1]","[2]"].',
  ].join('\n');
}

export function makeGeminiReranker(apiKey: string, model: string): Reranker {
  return {
    async rerank(query: string, candidates: RerankCandidate[], topK: number): Promise<string[]> {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: buildPrompt(query, candidates) }] }],
              generationConfig: { responseMimeType: 'application/json' },
            }),
          },
        );

        if (!res.ok) {
          console.warn(`[rerank] gemini rerank failed with status ${res.status}; using RRF fallback.`);
          return RRF_FALLBACK(candidates, topK);
        }

        const data = (await res.json()) as GeminiResponse;
        const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
        if (!text) {
          console.warn('[rerank] gemini rerank returned no text; using RRF fallback.');
          return RRF_FALLBACK(candidates, topK);
        }

        const ids = parseRanking(text, candidates, topK);
        if (!ids) {
          console.warn('[rerank] gemini rerank parse failed; using RRF fallback.');
          return RRF_FALLBACK(candidates, topK);
        }
        return ids;
      } catch (err) {
        console.warn('[rerank] gemini rerank error; using RRF fallback.', err);
        return RRF_FALLBACK(candidates, topK);
      }
    },
  };
}
