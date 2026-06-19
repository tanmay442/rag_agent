import { test, expect } from '@playwright/test';

test.describe('Chat RAG and admin flow', () => {
  test('asks a question, sees a citation, escalates to a ticket', async ({ page }) => {
    await page.goto('/chat');

    // Ask a question that the seeded student-portal handbook answers.
    await page.fill('[data-testid="chat-input"]', 'What time does school start?');
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

  test('admin upload page is reachable', async ({ page }) => {
    await page.goto('/admin/upload');
    await expect(page.locator('input[type="file"]')).toBeVisible();
  });
});
