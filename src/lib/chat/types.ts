import type { UIMessage } from 'ai';

export type MyUIMessage = UIMessage<
  {
    citations?: Array<{
      similarity: number;
      snippet: string;
    }>;
  },
  {
    citation: {
      similarity: number;
      snippet: string;
    };
  }
>;
