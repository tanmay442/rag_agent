import { test, expect } from '@playwright/test';

test.describe('Chat RAG and admin flow', () => {
  test('asks a question, sees a citation, escalates to a ticket', async ({ page }) => {
    await page.goto('/chat');

    // Ask a question that the Pulsar docs answer directly. With
    // `prefetchFirstTurn = false` the model calls
    // `searchDocumentation` itself, the result is returned, and the
    // citation card surfaces under the same `chat-citation`
    // testid.
    await page.fill('[data-testid="chat-input"]', 'How do I change my password?');
    await page.click('[data-testid="chat-send"]');

    // Citation should appear. The account-and-security fixture
    // covers password reset under Settings > Security.
    const citation = page.locator('[data-testid="chat-citation"]').first();
    await expect(citation).toBeVisible({ timeout: 20_000 });
    await expect(citation).toContainText(/similarity|match/i);

    // The conversation text should mention the path to the password
    // settings page. The LLM paraphrases the snippet, so we assert
    // a substring that survives rephrasing.
    await expect(page.locator('body')).toContainText(/Settings.*Security/, { timeout: 20_000 });

    // Ask an out-of-scope question (security incident) to provoke
    // the ticket flow. The bot must decline and open a ticket.
    await page.fill('[data-testid="chat-input"]', 'I think my account has been hacked.');
    await page.click('[data-testid="chat-send"]');
    await page.fill('[data-testid="chat-input"]', 'Please open a ticket and have someone call me.');
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
