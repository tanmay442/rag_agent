import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { validateEnv } from "../env";

function setValidBaseEnv() {
  vi.stubEnv("DATABASE_URL", "postgres://u:p@host/db?sslmode=require");
  vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_clerk");
  vi.stubEnv("CLERK_SECRET_KEY", "sk_test_clerk");
  vi.stubEnv("EMBEDDING_PROVIDER", "google");
  vi.stubEnv("AI_STUDIO_KEY", "test-ai-studio-key");
  vi.stubEnv("CHAT_PROVIDER", "openai");
  vi.stubEnv("CUSTOM_LLM_API_KEY", "test-chat-key");
  vi.stubEnv("CUSTOM_LLM_BASE_URL", "http://localhost:3000/v1");
  vi.stubEnv("BLOB_STORAGE_PROVIDER", "filesystem");
}

describe("validateEnv", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    setValidBaseEnv();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("resolves when all required vars are present", async () => {
    await expect(validateEnv()).resolves.toBeUndefined();
  });

  it("rejects when DATABASE_URL is missing", async () => {
    vi.stubEnv("DATABASE_URL", undefined as unknown as string);
    await expect(validateEnv()).rejects.toThrow(/DATABASE_URL/i);
  });

  it("rejects when CLERK_SECRET_KEY is missing", async () => {
    vi.stubEnv("CLERK_SECRET_KEY", undefined as unknown as string);
    await expect(validateEnv()).rejects.toThrow(/CLERK_SECRET_KEY/i);
  });

  it("rejects when NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", undefined as unknown as string);
    await expect(validateEnv()).rejects.toThrow(/CLERK_PUBLISHABLE_KEY/i);
  });
});
