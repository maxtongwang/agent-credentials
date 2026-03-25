// Tests for provider alias registry — lookups, reverse lookup, custom aliases.

import { describe, it, expect } from "vitest";
import {
  PROVIDERS,
  getProvider,
  getAllProviders,
  lookupEnvVar,
  registerAliases,
} from "../aliases.js";

describe("alias registry", () => {
  it("has 40 built-in providers", () => {
    expect(Object.keys(PROVIDERS).length).toBeGreaterThanOrEqual(40);
  });

  it("getProvider returns built-in provider", () => {
    const google = getProvider("google");
    expect(google).toBeDefined();
    expect(google!.credentials.oauth_token).toBeDefined();
    expect(google!.credentials.oauth_token.envVars).toContain(
      "GOOGLE_ACCESS_TOKEN",
    );
  });

  it("getProvider returns undefined for unknown", () => {
    expect(getProvider("nonexistent")).toBeUndefined();
  });

  it("getAllProviders includes all built-in", () => {
    const all = getAllProviders();
    expect(all).toContain("google");
    expect(all).toContain("github");
    expect(all).toContain("aws");
    expect(all).toContain("openai");
    expect(all).toContain("anthropic");
  });

  it("type-aware: api_key and oauth_token are separate", () => {
    const google = getProvider("google")!;
    expect(google.credentials.api_key.envVars).toContain("GOOGLE_API_KEY");
    expect(google.credentials.api_key.envVars).not.toContain(
      "GOOGLE_ACCESS_TOKEN",
    );
    expect(google.credentials.oauth_token.envVars).toContain(
      "GOOGLE_ACCESS_TOKEN",
    );
    expect(google.credentials.oauth_token.envVars).not.toContain(
      "GOOGLE_API_KEY",
    );
  });

  it("AWS has credential pair group", () => {
    const aws = getProvider("aws")!;
    expect(aws.credentials.access_key.group).toContain("AWS_ACCESS_KEY_ID");
    expect(aws.credentials.access_key.group).toContain("AWS_SECRET_ACCESS_KEY");
  });

  it("Twilio has credential pair group", () => {
    const twilio = getProvider("twilio")!;
    expect(twilio.credentials.auth_token.group).toContain("TWILIO_ACCOUNT_SID");
    expect(twilio.credentials.auth_token.group).toContain("TWILIO_AUTH_TOKEN");
  });
});

describe("lookupEnvVar (reverse lookup)", () => {
  it("finds provider for known env var", () => {
    const result = lookupEnvVar("GH_TOKEN");
    expect(result).not.toBeNull();
    expect(result!.provider).toBe("github");
    expect(result!.credentialType).toBe("personal_token");
  });

  it("finds provider for alias", () => {
    const result = lookupEnvVar("GITHUB_TOKEN");
    expect(result!.provider).toBe("github");
  });

  it("finds provider for group var", () => {
    const result = lookupEnvVar("AWS_SECRET_ACCESS_KEY");
    expect(result!.provider).toBe("aws");
  });

  it("returns null for unknown env var", () => {
    expect(lookupEnvVar("TOTALLY_UNKNOWN_VAR")).toBeNull();
  });
});

describe("custom aliases", () => {
  it("registerAliases adds custom provider", () => {
    registerAliases("my-service", {
      credentials: {
        api_key: {
          envVars: ["MY_SERVICE_KEY", "MY_SERVICE_TOKEN"],
          isSecret: true,
        },
      },
    });
    const def = getProvider("my-service");
    expect(def).toBeDefined();
    expect(def!.credentials.api_key.envVars).toContain("MY_SERVICE_KEY");
  });

  it("custom provider appears in getAllProviders", () => {
    registerAliases("custom-test", {
      credentials: {
        token: { envVars: ["CUSTOM_TOKEN"], isSecret: true },
      },
    });
    expect(getAllProviders()).toContain("custom-test");
  });

  it("custom provider findable via lookupEnvVar", () => {
    registerAliases("special-svc", {
      credentials: {
        key: { envVars: ["SPECIAL_SVC_KEY"], isSecret: true },
      },
    });
    const result = lookupEnvVar("SPECIAL_SVC_KEY");
    expect(result!.provider).toBe("special-svc");
  });
});
