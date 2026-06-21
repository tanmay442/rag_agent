// Chat-domain types. Currently just the UIMessage metadata
// shape used by the chat route; the data parts the AI SDK
// tools emit on the wire live here so the route and the
// component can both depend on the same source of truth.
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
