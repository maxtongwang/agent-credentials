// Tests for credential map — canonical registration, propagation, hasCredential.
// propagateToTools test uses a temp dir to avoid overwriting real tool config files.

import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  registerCanonical,
  hasCredential,
  getMap,
  propagateToTools,
  registerToolPath,
  KNOWN_TOOL_PATHS,
} from "../credential-map.js";

describe("credential map", () => {
  it("registerCanonical tracks a source file", () => {
    registerCanonical(
      "github",
      "personal_token",
      "test-acct",
      "/mock/gh/hosts.yml",
    );
    const map = getMap();
    const entry = map.find(
      (m) => m.provider === "github" && m.account === "test-acct",
    );
    expect(entry).toBeDefined();
    expect(entry!.canonicalPath).toBe("/mock/gh/hosts.yml");
  });

  it("hasCredential returns true after registration", () => {
    registerCanonical("github", "personal_token", "test-has", "/mock/path");
    expect(hasCredential("github", "personal_token", "test-has")).toBe(true);
  });

  it("hasCredential returns false for unknown provider", () => {
    expect(hasCredential("totally-unknown-provider", "api_key")).toBe(false);
  });

  it("registerCanonical updates existing entry", () => {
    registerCanonical("github", "personal_token", "test-update", "/old/path");
    registerCanonical("github", "personal_token", "test-update", "/new/path");
    const map = getMap();
    const entries = map.filter(
      (m) => m.provider === "github" && m.account === "test-update",
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]!.canonicalPath).toBe("/new/path");
  });

  it("KNOWN_TOOL_PATHS has entries for major tools", () => {
    const tools = KNOWN_TOOL_PATHS.map((p) => p.tool);
    expect(tools).toContain("gh");
    expect(tools).toContain("aws");
    expect(tools).toContain("gcloud");
  });

  it("propagateToTools writes to tool config paths (temp dir, fake provider)", () => {
    // Use a temp dir AND a fake provider so we never touch real tool config files.
    // Using a real provider like "github" would also propagate to ~/.config/gh/hosts.yml.
    const tmp = mkdtempSync(join(tmpdir(), "ac-test-"));
    const testToolPath = join(tmp, "fake-tool-config.yml");

    // Register a custom tool path with a fake provider
    registerToolPath({
      tool: "fake-tool-test",
      provider: "fake_provider_test",
      credentialType: "api_key",
      path: testToolPath,
      read: (content) => {
        const match = content.match(/token:\s*(.+)/);
        return match?.[1]?.trim() ?? null;
      },
      write: (token) => `token: ${token}\n`,
    });

    // Register canonical at a non-existent path so the test tool path is a candidate
    registerCanonical(
      "fake_provider_test",
      "api_key",
      "test-prop",
      "/nonexistent/path",
    );

    const populated = propagateToTools(
      "fake_provider_test",
      "api_key",
      "test-prop",
      "test_token_abc123",
    );

    expect(Array.isArray(populated)).toBe(true);
    expect(existsSync(testToolPath)).toBe(true);
    const content = readFileSync(testToolPath, "utf8");
    expect(content).toContain("test_token_abc123");
  });
});
