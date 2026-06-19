import 'server-only';

// Auth has been removed from this project. Tickets and uploads still need
// a `userId` for the database columns, so we use a single placeholder
// identity. Update this constant if/when the host site starts forwarding
// its own user identifier.
export const DEFAULT_USER_ID = 'anonymous';

export interface AppSession {
  user: {
    id: string;
    email: string;
    name: string;
    role: 'admin' | 'user';
  };
}

export async function getSession(): Promise<AppSession> {
  return {
    user: {
      id: DEFAULT_USER_ID,
      email: 'anonymous@example.com',
      name: 'Anonymous',
      role: 'admin',
    },
  };
}
