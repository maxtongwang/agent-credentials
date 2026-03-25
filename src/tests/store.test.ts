// Tests for CredentialStore — CRUD, multi-account, defaults, encryption.

import { describe, it, expect, beforeEach } from "vitest";
import { CredentialStore } from "../store.js";
import { MemoryBackend } from "../backends/memory.js";
import { AesGcmEncryption } from "../encryption/aes-gcm.js";
import { randomBytes } from "node:crypto";

const KEY = randomBytes(32).toString("hex");

let store: CredentialStore;
let backend: MemoryBackend;

beforeEach(() => {
  backend = new MemoryBackend();
  store = new CredentialStore({
    backend,
    encryption: new AesGcmEncryption(KEY),
  });
});

describe("store CRUD", () => {
  it("set + get round-trips a credential", async () => {
    await store.set({
      provider: "github",
      credentialType: "personal_token",
      token: "ghp_test123",
    });
    const cred = await store.get("github");
    expect(cred).not.toBeNull();
    expect(cred!.token).toBe("ghp_test123");
    expect(cred!.provider).toBe("github");
  });

  it("upserts on re-connect (same provider+account)", async () => {
    await store.set({
      provider: "github",
      credentialType: "personal_token",
      token: "old-token",
    });
    await store.set({
      provider: "github",
      credentialType: "personal_token",
      token: "new-token",
    });
    const cred = await store.get("github");
    expect(cred!.token).toBe("new-token");
    const list = await store.list("github");
    expect(list).toHaveLength(1); // upsert, not duplicate
  });

  it("delete removes credential", async () => {
    await store.set({
      provider: "github",
      credentialType: "personal_token",
      token: "ghp_test",
    });
    await store.delete("github", "default");
    expect(await store.get("github")).toBeNull();
  });

  it("list returns metadata without decrypted tokens", async () => {
    await store.set({
      provider: "github",
      credentialType: "personal_token",
      token: "secret",
      source: "cli:add",
    });
    const list = await store.list("github");
    expect(list).toHaveLength(1);
    expect(list[0]!.provider).toBe("github");
    expect(list[0]!.source).toBe("cli:add");
    // No token field in list output
    expect((list[0] as Record<string, unknown>).token).toBeUndefined();
  });

  it("get returns null for unknown provider", async () => {
    expect(await store.get("nonexistent")).toBeNull();
  });

  it("encrypts token at rest", async () => {
    await store.set({
      provider: "github",
      credentialType: "personal_token",
      token: "plaintext-secret",
    });
    // Read raw from backend — should be encrypted
    const raw = await backend.get("default", "github", "default");
    expect(raw!.token).not.toBe("plaintext-secret");
    expect(raw!.token).toContain("="); // base64
  });

  it("handles refreshToken encryption", async () => {
    await store.set({
      provider: "google",
      credentialType: "oauth_token",
      token: "access",
      refreshToken: "refresh-secret",
    });
    const cred = await store.get("google");
    expect(cred!.refreshToken).toBe("refresh-secret");
  });
});

describe("multi-account", () => {
  it("first account becomes default", async () => {
    await store.set({
      provider: "google",
      account: "work@co.com",
      credentialType: "oauth_token",
      token: "work-token",
    });
    const cred = await store.get("google");
    expect(cred!.account).toBe("work@co.com");
    expect(cred!.isDefault).toBe(true);
  });

  it("second account is not default", async () => {
    await store.set({
      provider: "google",
      account: "work@co.com",
      credentialType: "oauth_token",
      token: "work-token",
    });
    await store.set({
      provider: "google",
      account: "personal@gmail.com",
      credentialType: "oauth_token",
      token: "personal-token",
    });
    // Default get returns first (default) account
    const cred = await store.get("google");
    expect(cred!.account).toBe("work@co.com");
  });

  it("get with specific account returns that account", async () => {
    await store.set({
      provider: "google",
      account: "work@co.com",
      credentialType: "oauth_token",
      token: "work-token",
    });
    await store.set({
      provider: "google",
      account: "personal@gmail.com",
      credentialType: "oauth_token",
      token: "personal-token",
    });
    const cred = await store.get("google", "personal@gmail.com");
    expect(cred!.token).toBe("personal-token");
  });

  it("setDefault changes which account is returned by default get", async () => {
    await store.set({
      provider: "google",
      account: "a@co.com",
      credentialType: "oauth_token",
      token: "token-a",
    });
    await store.set({
      provider: "google",
      account: "b@co.com",
      credentialType: "oauth_token",
      token: "token-b",
    });
    await store.setDefault("google", "b@co.com");
    const cred = await store.get("google");
    expect(cred!.token).toBe("token-b");
  });

  it("delete default promotes next to default", async () => {
    await store.set({
      provider: "google",
      account: "a@co.com",
      credentialType: "oauth_token",
      token: "token-a",
    });
    await store.set({
      provider: "google",
      account: "b@co.com",
      credentialType: "oauth_token",
      token: "token-b",
    });
    await store.delete("google", "a@co.com");
    const cred = await store.get("google");
    expect(cred).not.toBeNull();
    expect(cred!.account).toBe("b@co.com");
  });

  it("accounts() lists all accounts with default marker", async () => {
    await store.set({
      provider: "google",
      account: "a@co.com",
      credentialType: "oauth_token",
      token: "t",
    });
    await store.set({
      provider: "google",
      account: "b@co.com",
      credentialType: "oauth_token",
      token: "t",
    });
    const accounts = await store.accounts("google");
    expect(accounts).toHaveLength(2);
    expect(accounts.find((a) => a.account === "a@co.com")!.isDefault).toBe(
      true,
    );
    expect(accounts.find((a) => a.account === "b@co.com")!.isDefault).toBe(
      false,
    );
  });

  it("0 accounts returns empty", async () => {
    const accounts = await store.accounts("google");
    expect(accounts).toHaveLength(0);
  });
});

describe("group values (credential pairs)", () => {
  it("stores and retrieves group values", async () => {
    await store.set({
      provider: "aws",
      credentialType: "access_key",
      token: "AKIAIOSFODNN7EXAMPLE",
      groupValues: {
        AWS_ACCESS_KEY_ID: "AKIAIOSFODNN7EXAMPLE",
        AWS_SECRET_ACCESS_KEY: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      },
    });
    const cred = await store.get("aws");
    expect(cred!.groupValues).toBeDefined();
    expect(cred!.groupValues!.AWS_ACCESS_KEY_ID).toBe("AKIAIOSFODNN7EXAMPLE");
    expect(cred!.groupValues!.AWS_SECRET_ACCESS_KEY).toBe(
      "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    );
  });

  it("encrypts group values at rest", async () => {
    await store.set({
      provider: "aws",
      credentialType: "access_key",
      token: "AKIA",
      groupValues: { AWS_SECRET_ACCESS_KEY: "secret" },
    });
    const raw = await backend.get("default", "aws", "default");
    expect(raw!.groupValues!.AWS_SECRET_ACCESS_KEY).not.toBe("secret");
  });
});

describe("workspace isolation", () => {
  it("workspace A creds not visible to workspace B", async () => {
    await store.set({
      provider: "github",
      credentialType: "personal_token",
      token: "ws-a-token",
      workspaceId: "ws-a",
    });
    const fromA = await store.get("github", undefined, "ws-a");
    const fromB = await store.get("github", undefined, "ws-b");
    expect(fromA!.token).toBe("ws-a-token");
    expect(fromB).toBeNull();
  });
});

describe("expiry", () => {
  it("flags expired credentials in list", async () => {
    await store.set({
      provider: "google",
      credentialType: "oauth_token",
      token: "expired",
      expiresAt: Date.now() - 1000,
    });
    const list = await store.list("google");
    expect(list[0]!.isExpired).toBe(true);
  });

  it("non-expired credentials are not flagged", async () => {
    await store.set({
      provider: "google",
      credentialType: "oauth_token",
      token: "valid",
      expiresAt: Date.now() + 3600_000,
    });
    const list = await store.list("google");
    expect(list[0]!.isExpired).toBe(false);
  });
});
