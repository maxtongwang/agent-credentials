// Tests for env resolver — alias expansion, multi-account, collisions, formats.

import { describe, it, expect, beforeEach } from "vitest";
import { CredentialStore } from "../store.js";
import { MemoryBackend } from "../backends/memory.js";
import { AesGcmEncryption } from "../encryption/aes-gcm.js";
import { resolveEnv, formatInject, formatDryRun } from "../resolver.js";
import { randomBytes } from "node:crypto";

const KEY = randomBytes(32).toString("hex");

let store: CredentialStore;

beforeEach(() => {
  store = new CredentialStore({
    backend: new MemoryBackend(),
    encryption: new AesGcmEncryption(KEY),
  });
});

describe("resolveEnv", () => {
  it("expands all aliases for default account", async () => {
    await store.set({
      provider: "google",
      credentialType: "oauth_token",
      token: "ya29-test",
    });
    const env = await resolveEnv(store);
    expect(env.GOOGLE_ACCESS_TOKEN).toBe("ya29-test");
    expect(env.GOOGLE_OAUTH_TOKEN).toBe("ya29-test");
    expect(env.CLOUDSDK_AUTH_ACCESS_TOKEN).toBe("ya29-test");
  });

  it("does not cross-type bleed (api_key vars don't get oauth_token)", async () => {
    await store.set({
      provider: "google",
      credentialType: "oauth_token",
      token: "ya29-oauth",
    });
    const env = await resolveEnv(store);
    expect(env.GOOGLE_API_KEY).toBeUndefined();
    expect(env.GOOGLE_ACCESS_TOKEN).toBe("ya29-oauth");
  });

  it("includes account list", async () => {
    await store.set({
      provider: "google",
      account: "a@co.com",
      credentialType: "oauth_token",
      token: "t1",
    });
    await store.set({
      provider: "google",
      account: "b@co.com",
      credentialType: "oauth_token",
      token: "t2",
    });
    const env = await resolveEnv(store);
    expect(env.CREDENTIAL_ACCOUNTS_google).toBe("a@co.com,b@co.com");
  });

  it("non-default accounts get suffixed env vars", async () => {
    await store.set({
      provider: "google",
      account: "default-acct",
      credentialType: "oauth_token",
      token: "default-token",
    });
    await store.set({
      provider: "google",
      account: "other@gmail.com",
      credentialType: "oauth_token",
      token: "other-token",
    });
    const env = await resolveEnv(store);
    expect(env.GOOGLE_ACCESS_TOKEN).toBe("default-token");
    expect(env.GOOGLE_ACCESS_TOKEN__other_gmail_com).toBe("other-token");
  });

  it("flags expired credentials", async () => {
    await store.set({
      provider: "google",
      credentialType: "oauth_token",
      token: "expired",
      expiresAt: Date.now() - 1000,
    });
    const env = await resolveEnv(store);
    expect(env.CREDENTIAL_EXPIRED_google).toBe("true");
    // Token still injected
    expect(env.GOOGLE_ACCESS_TOKEN).toBe("expired");
  });

  it("returns empty for empty store", async () => {
    const env = await resolveEnv(store);
    expect(Object.keys(env)).toHaveLength(0);
  });

  it("handles multiple providers", async () => {
    await store.set({
      provider: "github",
      credentialType: "personal_token",
      token: "ghp_test",
    });
    await store.set({
      provider: "openai",
      credentialType: "api_key",
      token: "sk-test",
    });
    const env = await resolveEnv(store);
    expect(env.GH_TOKEN).toBe("ghp_test");
    expect(env.GITHUB_TOKEN).toBe("ghp_test");
    expect(env.OPENAI_API_KEY).toBe("sk-test");
  });
});

describe("formatInject", () => {
  it("shell format: valid bash exports", () => {
    const output = formatInject({ GH_TOKEN: "ghp_test", FOO: "bar" }, "shell");
    expect(output).toContain("export GH_TOKEN=ghp_test");
    expect(output).toContain("export FOO=bar");
  });

  it("shell format: escapes special chars", () => {
    const output = formatInject({ TOKEN: "has spaces & $pecial" }, "shell");
    expect(output).toContain("'has spaces & $pecial'");
  });

  it("fish format: uses set -gx", () => {
    const output = formatInject({ GH_TOKEN: "test" }, "fish");
    expect(output).toContain("set -gx GH_TOKEN test");
  });

  it("json format: valid JSON", () => {
    const output = formatInject({ A: "1", B: "2" }, "json");
    const parsed = JSON.parse(output);
    expect(parsed.A).toBe("1");
    expect(parsed.B).toBe("2");
  });

  it("empty env: empty string", () => {
    expect(formatInject({}, "shell")).toBe("");
  });
});

describe("formatDryRun", () => {
  it("masks secret values", () => {
    const output = formatDryRun({
      GH_TOKEN: "ghp_1234567890abcdef",
    });
    expect(output).toContain("ghp_");
    expect(output).toContain("...");
    expect(output).not.toContain("1234567890abcdef");
  });

  it("does not mask CREDENTIAL_ vars", () => {
    const output = formatDryRun({
      CREDENTIAL_ACCOUNTS_google: "a@co.com,b@co.com",
    });
    expect(output).toContain("a@co.com,b@co.com");
  });
});
