// Catch-all Better Auth API handler. Neon Auth runs a managed version of
// Better Auth and proxies all of its endpoints (/sign-in, /sign-up,
// /get-session, etc.) through this single route.
import { auth } from '@/lib/auth/server';

const { GET, POST, PUT, DELETE, PATCH } = auth.handler();
export { GET, POST, PUT, DELETE, PATCH };
