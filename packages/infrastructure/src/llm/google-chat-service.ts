// Google AI Studio chat adapter for users who want Google for both
// embedding and chat.
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { LanguageModelV3 } from '@ai-sdk/provider';

export function makeGoogleChatModel(apiKey: string | null): LanguageModelV3 {
  if (!apiKey) {
    throw new Error('AI_STUDIO_KEY is not set.');
  }
  const google = createGoogleGenerativeAI({ apiKey });
  return google.chat('gemini-1.5-flash') as LanguageModelV3;
}

export function getGoogleChatModel(): LanguageModelV3 {
  return makeGoogleChatModel(process.env.AI_STUDIO_KEY ?? null);
}
