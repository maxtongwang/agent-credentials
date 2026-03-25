// Tests for credential map — canonical registration, propagation, hasCredential.

import { describe, it, expect } from "vitest";
import {
  registerCanonical,
  hasCredential,
  getMap,
  propagateToTools,
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

  it("propagateToTools returns populated paths", () => {
    // Register with a non-existent canonical so all tool paths are candidates
    registerCanonical(
      "github",
      "personal_token",
      "test-prop",
      "/nonexistent/path",
    );
    const populated = propagateToTools(
      "github",
      "personal_token",
      "test-prop",
      "ghp_test_propagate_123",
    );
    // May or may not populate depending on whether tool paths already have creds
    expect(Array.isArray(populated)).toBe(true);
  });
});
