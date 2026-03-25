// Keychain provider interface — pluggable credential storage backends (OS keychain, 1Password, etc.)

export interface KeychainProvider {
  /** Provider name (macos, linux-secret-service, 1password, bitwarden, etc.) */
  name: string;
  /** Check if this provider is available in the current environment. */
  detect(): Promise<boolean>;
  /** Get a credential by service + account. Returns null if not found. */
  get(service: string, account: string): Promise<string | null>;
  /** Store a credential. */
  set(service: string, account: string, value: string): Promise<void>;
  /** Delete a credential. */
  delete(service: string, account: string): Promise<void>;
  /** List all credentials for a service prefix. Returns account names. */
  list(servicePrefix: string): Promise<string[]>;
}

/** Service name prefix used in keychain — all our entries use this. */
export const KEYCHAIN_SERVICE_PREFIX = "agent-credentials";

/** Build keychain service name for a provider+credType combo. */
export function keychainService(provider: string, credType: string): string {
  return `${KEYCHAIN_SERVICE_PREFIX}/${provider}/${credType}`;
}
