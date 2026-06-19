import type { AppConfig } from '../src/lib/config/schema';

// Runtime configuration for this deployment of the RAG Support Agent.
//
// Edit any field, or run `pnpm setup` to be walked through the values
// interactively. The schema in `src/lib/config/schema.ts` validates
// this object on load; required fields have defaults so an empty
// file is valid.
//
// Required externally: nothing. This file is the source of truth for
// org name, agent persona, admin bootstrap emails, and the seed-PDFs
// directory. The setup CLI also writes `ADMIN_EMAILS` to .env.local
// so the existing Clerk-based admin bootstrap in src/lib/auth/users.ts
// keeps working.

const config: AppConfig = {
  // The full name of the org the agent represents. Used in the
  // system prompt and the landing page hero.
  orgName: 'Gardenia Public School',

  // Short brand shown in the top nav and mobile sheet.
  orgShortName: 'RAG Support',

  // Who the agent is talking to. Phrased as a noun phrase; the
  // system prompt builds "help <audience> find answers ...".
  audience: 'parents and students',

  // Persona. `name` is optional; if set, the agent introduces itself
  // by name on the first reply. `tone` controls length and warmth.
  agentPersona: {
    name: undefined,
    tone: 'friendly',
  },

  // Free-form additions to the system prompt. Use this for org-
  // specific rules the persona / out-of-scope lists don't cover
  // (e.g. "Always sign off with '— The Front Office'").
  customInstructions: undefined,

  // Topics the agent should refuse to answer and how to redirect.
  // The defaults (medical, legal) are good safety nets; add more
  // for your deployment (e.g. "fee negotiation", "staff discipline").
  outOfScopeTopics: [
    {
      topic: 'medical',
      handling:
        'Decline politely and suggest they contact the school nurse or their family doctor directly.',
    },
    {
      topic: 'legal',
      handling:
        'Decline politely and suggest they contact the appropriate office (front desk, principal) directly.',
    },
  ],

  // Bootstrap admin emails. The first time a user with one of these
  // emails signs in via Clerk, they are auto-promoted to `admin`.
  // After that, admins promote others from /admin/users.
  // The setup CLI also writes this list to ADMIN_EMAILS in
  // .env.local so the existing bootstrap code path keeps working.
  adminEmails: [],

  // Browser tab title + meta description.
  branding: {
    title: 'RAG Support',
    description: 'Serverless AI customer support agent with RAG citations.',
  },

  // Where the setup CLI drops seed PDFs and where `pnpm seed`
  // ingests from. Relative to the repo root.
  seedDocsDir: './documents',

  // When true, the chat route pre-embeds the user's first message
  // and injects top-K chunks into the system prompt, so the model
  // has grounded context even if it does not call the search tool
  // itself. Set false to disable the pre-fetch and rely on the
  // model to call the tool every turn.
  prefetchFirstTurn: true,
};

export default config;
