export async function register() {
  // Only run on the server (not in the browser).
  if (process.env.NEXT_RUNTIME) {
    const { validateEnv } = await import('./src/lib/env');
    try {
      await validateEnv();
    } catch (error) {
      console.error('Environment validation failed:', error);
      // Fail fast in local dev so the developer sees the error immediately.
      if (process.env.NODE_ENV === 'development') {
        throw error;
      }
    }
  }
}
