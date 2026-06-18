'use client';

import { createAuthClient } from '@neondatabase/auth';

const url =
  process.env.NEXT_PUBLIC_NEON_AUTH_URL ??
  // Fall back to the server-side base URL (also exposed to the browser via
  // the env file). This keeps client code working in environments where
  // only the server var is set.
  process.env.NEON_AUTH_BASE_URL ??
  '';

export const authClient = createAuthClient(url);
