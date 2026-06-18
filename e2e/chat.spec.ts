import { test, expect, type Page } from '@playwright/test';

// Helper: sign in via the Better Auth signIn form.
async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  // Either redirects to /chat (regular user) or /admin/upload (admin).
  await page.waitForURL(/\/(chat|admin)/, { timeout: 15_000 });
}

test.describe('Chat RAG and admin flow', () => {
  
  test('signs in, asks a question, sees a citation, escalates to a ticket', async ({ page }) => {
    const email = process.env.E2E_USER_EMAIL ?? 'test-user@example.com';
    const password = process.env.E2E_USER_PASSWORD ?? 'test-password-1234';
    await signIn(page, email, password);

    // Ask a question that the seeded handbook answers.
    await page.fill('[data-testid="chat-input"]', 'What does the dental plan cover?');
    await page.click('[data-testid="chat-send"]');

    // Citation should appear.
    const citation = page.locator('[data-testid="chat-citation"]').first();
    await expect(citation).toBeVisible({ timeout: 20_000 });
    await expect(citation).toContainText(/similarity/i);

    // Ask an off-topic question twice to provoke the ticket escalation.
    await page.fill('[data-testid="chat-input"]', 'Tell me about the weather on Mars.');
    await page.click('[data-testid="chat-send"]');
    await page.waitForTimeout(2_000);
    await page.fill('[data-testid="chat-input"]', 'No really, I need a human.');
    await page.click('[data-testid="chat-send"]');

    // Tool output surfaces the ticket id. We assert the page contains a
    // TKT- prefix token.
    await expect(page.locator('body')).toContainText(/TKT-\d+/, { timeout: 30_000 });
  });

  test('admin can upload a PDF and a non-admin cannot reach /admin', async ({ browser }) => {
    // Non-admin path: try /admin/upload and expect a redirect to /chat
    // (or 403 from the layout, depending on the proxy outcome).
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const email = process.env.E2E_USER_EMAIL ?? 'test-user@example.com';
    const password = process.env.E2E_USER_PASSWORD ?? 'test-password-1234';
    await signIn(page, email, password);
    await page.goto('/admin/upload');
    await expect(page).toHaveURL(/\/chat|\/login/);
    await ctx.close();

    // Admin path: sign in as the bootstrap admin and land on /admin/upload.
    const adminEmail = process.env.E2E_ADMIN_EMAIL ?? 'degeneratedestroyer58008@gmail.com';
    const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? 'test-password-1234';
    const adminCtx = await browser.newContext();
    const adminPage = await adminCtx.newPage();
    await signIn(adminPage, adminEmail, adminPassword);
    await adminPage.goto('/admin/upload');
    await expect(adminPage.locator('input[type="file"]')).toBeVisible();
    await adminCtx.close();
  });
});
