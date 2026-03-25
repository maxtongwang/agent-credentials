// Tests for env var scanner.

import { describe, it, expect, vi, afterEach } from "vitest";
import { EnvScanner } from "../../scanners/env.js";

afterEach(() => vi.restoreAllMocks());

describe("EnvScanner", () => {
  it("discovers GOOGLE_API_KEY from env", async () => {
    vi.stubEnv("GOOGLE_API_KEY", "AIza-test");
    const scanner = new EnvScanner();
    const creds = await scanner.scan();
    const google = creds.find((c) => c.provider === "google");
    expect(google).toBeDefined();
    expect(google!.credentialType).toBe("api_key");
    expect(google!.value).toBe("AIza-test");
    expect(google!.source).toBe("env:GOOGLE_API_KEY");
  });

  it("discovers GH_TOKEN from env", async () => {
    vi.stubEnv("GH_TOKEN", "ghp_test");
    const scanner = new EnvScanner();
    const creds = await scanner.scan();
    const gh = creds.find((c) => c.provider === "github");
    expect(gh).toBeDefined();
    expect(gh!.value).toBe("ghp_test");
  });

  it("discovers AWS key pair as group", async () => {
    vi.stubEnv("AWS_ACCESS_KEY_ID", "AKIA");
    vi.stubEnv("AWS_SECRET_ACCESS_KEY", "secret");
    const scanner = new EnvScanner();
    const creds = await scanner.scan();
    const aws = creds.find(
      (c) => c.provider === "aws" && c.credentialType === "access_key",
    );
    expect(aws).toBeDefined();
    expect(aws!.groupValues).toBeDefined();
    expect(aws!.groupValues!.AWS_ACCESS_KEY_ID).toBe("AKIA");
    expect(aws!.groupValues!.AWS_SECRET_ACCESS_KEY).toBe("secret");
  });

  it("ignores env vars not in registry", async () => {
    vi.stubEnv("RANDOM_THING", "value");
    const scanner = new EnvScanner();
    const creds = await scanner.scan();
    expect(creds.find((c) => c.value === "value")).toBeUndefined();
  });

  it("always detects (env is always available)", async () => {
    const scanner = new EnvScanner();
    expect(await scanner.detect()).toBe(true);
  });
});
