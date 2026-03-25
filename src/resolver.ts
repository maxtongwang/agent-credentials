// Env resolver — resolves all credentials into env vars with alias expansion.
// Produces: export KEY=VALUE lines (bash/zsh), set -x KEY VALUE (fish), or JSON.

import type { CredentialStore } from "./store.js";
import { getProvider } from "./aliases.js";

export type OutputFormat = "shell" | "fish" | "json";

/**
 * Resolve all credentials for a workspace into a flat env var map.
 * Expands aliases: same token injected under all known env var names.
 * Handles: multi-account defaults, credential groups, collisions.
 */
export async function resolveEnv(
  store: CredentialStore,
  workspaceId?: string,
): Promise<Record<string, string>> {
  const ws = workspaceId ?? store.getDefaultWorkspace();
  const backend = store.getBackend();
  const encryption = store.getEncryption();
  const all = await backend.listAll(ws);

  const env: Record<string, string> = {};
  const providerAccounts = new Map<string, string[]>();
  const collisions = new Map<string, string[]>(); // envVar → [provider1, provider2]

  for (const cred of all) {
    const provDef = getProvider(cred.provider);
    if (!provDef) continue;

    const credType = provDef.credentials[cred.credentialType];
    if (!credType) continue;

    // Track accounts per provider
    const accounts = providerAccounts.get(cred.provider) ?? [];
    accounts.push(cred.account);
    providerAccounts.set(cred.provider, accounts);

    // Decrypt token
    let token: string;
    try {
      token = encryption.decrypt(cred.token);
    } catch {
      // Flag expired/corrupted
      env[`CREDENTIAL_ERROR_${cred.provider}`] =
        `decrypt_failed:${cred.account}`;
      continue;
    }

    // Check expiry
    if (cred.expiresAt && cred.expiresAt < Date.now()) {
      env[`CREDENTIAL_EXPIRED_${cred.provider}`] = "true";
    }

    // Only inject aliases for default account (or if only one account)
    if (
      !cred.isDefault &&
      all.filter((c) => c.provider === cred.provider).length > 1
    ) {
      // Non-default: inject with account suffix only
      const safeSuffix = cred.account.replace(/[^a-zA-Z0-9]/g, "_");
      for (const envVar of credType.envVars) {
        env[`${envVar}__${safeSuffix}`] = token;
      }
      continue;
    }

    // Default account: inject all aliases
    for (const envVar of credType.envVars) {
      // Collision detection
      if (env[envVar] !== undefined) {
        const existing = collisions.get(envVar) ?? [];
        existing.push(cred.provider);
        collisions.set(envVar, existing);
        // Suffix with provider to disambiguate
        const safeSuffix = `${cred.provider}_${cred.account.replace(/[^a-zA-Z0-9]/g, "_")}`;
        env[`${envVar}__${safeSuffix}`] = token;
        continue;
      }
      env[envVar] = token;
    }

    // Group values (AWS key+secret, Twilio SID+token)
    if (credType.group && cred.groupValues) {
      for (const groupVar of credType.group) {
        const groupVal = cred.groupValues[groupVar];
        if (groupVal) {
          try {
            env[groupVar] = encryption.decrypt(groupVal);
          } catch {
            // Skip corrupted group value
          }
        }
      }
    }

    // Config vars (non-secret, from credential metadata or defaults)
    // These are not stored in the credential — they're injected from provider config knowledge
  }

  // Inject account lists
  for (const [provider, accounts] of providerAccounts) {
    env[`CREDENTIAL_ACCOUNTS_${provider}`] = accounts.join(",");
  }

  // Inject collision info
  for (const [envVar, providers] of collisions) {
    env[`CREDENTIAL_PROVIDERS_${envVar}`] = providers.join(",");
  }

  return env;
}

/**
 * Format resolved env vars for shell injection.
 */
export function formatInject(
  env: Record<string, string>,
  format: OutputFormat,
): string {
  const entries = Object.entries(env);
  if (entries.length === 0) return "";

  switch (format) {
    case "json":
      return JSON.stringify(env, null, 2);

    case "fish":
      return entries
        .map(([k, v]) => `set -gx ${k} ${shellEscape(v)}`)
        .join("\n");

    case "shell":
    default:
      return entries
        .map(([k, v]) => `export ${k}=${shellEscape(v)}`)
        .join("\n");
  }
}

/**
 * Format a dry-run output — shows what would be injected with masked values.
 */
export function formatDryRun(env: Record<string, string>): string {
  return Object.entries(env)
    .map(([k, v]) => {
      if (k.startsWith("CREDENTIAL_")) return `${k}=${v}`;
      const masked =
        v.length > 8 ? v.slice(0, 4) + "..." + v.slice(-4) : "****";
      return `${k}=${masked}`;
    })
    .join("\n");
}

/** Shell-escape a value for safe use in export/set statements. */
function shellEscape(val: string): string {
  // If value contains special chars, single-quote it
  if (/[^a-zA-Z0-9_\-/.,:+=@%]/.test(val)) {
    // Escape single quotes within the value
    return `'${val.replace(/'/g, "'\\''")}'`;
  }
  return val;
}
