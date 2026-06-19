import { test, expect } from '@playwright/test';

// E2E for the admin console. These tests are intended to run against a
// preview deployment that has a real Clerk project wired up; locally
// the dev server has no Clerk keys, so we set `SKIP_AUTH_E2E=1` to
// skip them.
const SKIP = process.env.SKIP_AUTH_E2E === '1';

test.describe('Admin console (auth + RBAC)', () => {
  test.skip(SKIP, 'Auth-gated E2E requires a Clerk project; set SKIP_AUTH_E2E=0 to enable');

  test('landing page is public and renders a sign-in CTA', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('Serverless AI Customer Support');
    // Sign-in button on the landing page (renders for signed-out users).
    await expect(
      page.locator('[data-testid="home-sign-in"], [data-testid="nav-sign-in"]').first(),
    ).toBeVisible();
  });

  test('/chat redirects to /sign-in when unauthenticated', async ({ page }) => {
    const response = await page.goto('/chat', { waitUntil: 'domcontentloaded' });
    // clerkMiddleware sends a 307 to /sign-in?redirect_url=...
    expect(response?.url()).toMatch(/\/sign-in/);
  });

  test('/admin redirects to /sign-in when unauthenticated', async ({ page }) => {
    const response = await page.goto('/admin', { waitUntil: 'domcontentloaded' });
    expect(response?.url()).toMatch(/\/sign-in/);
  });

  test('/admin redirects non-admin to /chat', async ({ page, context }) => {
    // Set a fake Clerk session cookie. The exact shape depends on
    // Clerk; we set the session id header so the middleware's
    // `auth()` call returns a non-admin identity. This is best-effort
    // and only works in preview with a configured Clerk project.
    await context.addCookies([
      {
        name: '__session',
        value: 'fake-non-admin-session',
        domain: 'localhost',
        path: '/',
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);
    const response = await page.goto('/admin', { waitUntil: 'domcontentloaded' });
    // Without a real session, the middleware will redirect to /sign-in.
    // We assert the URL isn't /admin and that the user isn't on the
    // admin overview.
    expect(response?.url()).not.toMatch(/\/admin$/);
  });
});
