// Keychain registry — auto-detect or user-configured keychain provider.

import type { KeychainProvider } from "./interface.js";
import { MacOSKeychainProvider } from "./macos.js";
import { OnePasswordProvider } from "./onepassword.js";
import { BitwardenProvider } from "./bitwarden.js";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export type { KeychainProvider } from "./interface.js";
export { keychainService, KEYCHAIN_SERVICE_PREFIX } from "./interface.js";
export { MacOSKeychainProvider } from "./macos.js";
export { OnePasswordProvider } from "./onepassword.js";
export { BitwardenProvider } from "./bitwarden.js";

const CONFIG_DIR = join(homedir(), ".agent-credentials");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

interface Config {
  keychain?: string; // "macos" | "1password" | "bitwarden" | "default"
}

/** All built-in keychain providers. */
const ALL_PROVIDERS: KeychainProvider[] = [
  new MacOSKeychainProvider(),
  new OnePasswordProvider(),
  new BitwardenProvider(),
];

/** Read user config. */
function readConfig(): Config {
  try {
    if (existsSync(CONFIG_FILE)) {
      return JSON.parse(readFileSync(CONFIG_FILE, "utf8")) as Config;
    }
  } catch {
    // Corrupted — ignore
  }
  return {};
}

/** Write user config. */
export function writeConfig(config: Config): void {
  mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
}

/** Set the keychain provider. Persists to config. */
export function setKeychainProvider(name: string): void {
  writeConfig({ ...readConfig(), keychain: name });
}

/**
 * Resolve the active keychain provider.
 * Priority: user config → auto-detect (macOS Keychain → none).
 */
export async function resolveKeychainProvider(): Promise<KeychainProvider | null> {
  const config = readConfig();

  // User explicitly chose a provider
  if (config.keychain && config.keychain !== "default") {
    const provider = ALL_PROVIDERS.find((p) => p.name === config.keychain);
    if (provider && (await provider.detect())) return provider;
    // Configured but not available — fall through to auto-detect
  }

  // Auto-detect: try each in order
  for (const provider of ALL_PROVIDERS) {
    if (await provider.detect()) return provider;
  }

  return null; // No keychain available — file backend only
}

/** List available keychain providers (for CLI help). */
export async function listAvailableProviders(): Promise<
  Array<{ name: string; available: boolean }>
> {
  const results = [];
  for (const p of ALL_PROVIDERS) {
    results.push({ name: p.name, available: await p.detect() });
  }
  return results;
}
