// CredentialStore — core orchestrator. Manages credentials with encryption + backend.

import type {
  CredentialBackend,
  StoredCredential,
} from "./backends/interface.js";
import type { EncryptionProvider } from "./encryption/interface.js";

export interface CredentialStoreOptions {
  backend: CredentialBackend;
  encryption: EncryptionProvider;
  /** Default workspace for single-user local mode. */
  defaultWorkspace?: string;
}

export class CredentialStore {
  private readonly backend: CredentialBackend;
  private readonly encryption: EncryptionProvider;
  private readonly defaultWs: string;

  constructor(opts: CredentialStoreOptions) {
    this.backend = opts.backend;
    this.encryption = opts.encryption;
    this.defaultWs = opts.defaultWorkspace ?? "default";
  }

  /** Store a credential. Encrypts token + refreshToken before persisting. Upserts if exists. */
  async set(opts: {
    provider: string;
    account?: string;
    credentialType: string;
    token: string;
    refreshToken?: string;
    scopes?: string[];
    expiresAt?: number;
    groupValues?: Record<string, string>;
    source?: string;
    workspaceId?: string;
  }): Promise<void> {
    const ws = opts.workspaceId ?? this.defaultWs;
    const account = opts.account ?? "default";

    // Check if this is the first credential for this provider — auto-default
    const existing = await this.backend.list(ws, opts.provider);
    const isFirst = existing.length === 0;

    // Encrypt secrets
    const encToken = this.encryption.encrypt(opts.token);
    const encRefresh = opts.refreshToken
      ? this.encryption.encrypt(opts.refreshToken)
      : undefined;
    const encGroup = opts.groupValues
      ? Object.fromEntries(
          Object.entries(opts.groupValues).map(([k, v]) => [
            k,
            this.encryption.encrypt(v),
          ]),
        )
      : undefined;

    const cred: StoredCredential = {
      provider: opts.provider,
      account,
      credentialType: opts.credentialType,
      token: encToken,
      refreshToken: encRefresh,
      scopes: opts.scopes,
      expiresAt: opts.expiresAt,
      isDefault: isFirst,
      groupValues: encGroup,
      metadata: {
        storedAt: Date.now(),
        source: opts.source,
      },
    };

    await this.backend.set(ws, cred);
  }

  /** Get a credential. Decrypts token + refreshToken. Returns null if not found. */
  async get(
    provider: string,
    account?: string,
    workspaceId?: string,
  ): Promise<{
    provider: string;
    account: string;
    credentialType: string;
    token: string;
    refreshToken?: string;
    scopes?: string[];
    expiresAt?: number;
    isDefault?: boolean;
    groupValues?: Record<string, string>;
  } | null> {
    const ws = workspaceId ?? this.defaultWs;
    const acc = account ?? "default";

    // If no specific account, find the default
    let cred: StoredCredential | null;
    if (!account) {
      const all = await this.backend.list(ws, provider);
      cred = all.find((c) => c.isDefault) ?? all[0] ?? null;
    } else {
      cred = await this.backend.get(ws, provider, acc);
    }

    if (!cred) return null;

    // Update lastUsedAt
    cred.metadata.lastUsedAt = Date.now();
    await this.backend.set(ws, cred).catch(() => undefined);

    return {
      provider: cred.provider,
      account: cred.account,
      credentialType: cred.credentialType,
      token: this.encryption.decrypt(cred.token),
      refreshToken: cred.refreshToken
        ? this.encryption.decrypt(cred.refreshToken)
        : undefined,
      scopes: cred.scopes,
      expiresAt: cred.expiresAt,
      isDefault: cred.isDefault,
      groupValues: cred.groupValues
        ? Object.fromEntries(
            Object.entries(cred.groupValues).map(([k, v]) => [
              k,
              this.encryption.decrypt(v),
            ]),
          )
        : undefined,
    };
  }

  /** Delete a credential. If it was default, next remaining becomes default. */
  async delete(
    provider: string,
    account: string,
    workspaceId?: string,
  ): Promise<void> {
    const ws = workspaceId ?? this.defaultWs;
    const cred = await this.backend.get(ws, provider, account);
    const wasDefault = cred?.isDefault;

    await this.backend.delete(ws, provider, account);

    // Promote next credential to default if deleted was default
    if (wasDefault) {
      const remaining = await this.backend.list(ws, provider);
      if (remaining.length > 0 && !remaining.some((c) => c.isDefault)) {
        await this.backend.setDefault(ws, provider, remaining[0]!.account);
      }
    }
  }

  /** List credentials for a provider (or all). Returns metadata only — no decrypted tokens. */
  async list(
    provider?: string,
    workspaceId?: string,
  ): Promise<
    Array<{
      provider: string;
      account: string;
      credentialType: string;
      isDefault?: boolean;
      expiresAt?: number;
      isExpired: boolean;
      source?: string;
    }>
  > {
    const ws = workspaceId ?? this.defaultWs;
    const creds = provider
      ? await this.backend.list(ws, provider)
      : await this.backend.listAll(ws);

    return creds.map((c) => ({
      provider: c.provider,
      account: c.account,
      credentialType: c.credentialType,
      isDefault: c.isDefault,
      expiresAt: c.expiresAt,
      isExpired: c.expiresAt ? c.expiresAt < Date.now() : false,
      source: c.metadata.source,
    }));
  }

  /** Set default account for a provider. */
  async setDefault(
    provider: string,
    account: string,
    workspaceId?: string,
  ): Promise<void> {
    const ws = workspaceId ?? this.defaultWs;
    await this.backend.setDefault(ws, provider, account);
  }

  /** List accounts for a provider. */
  async accounts(
    provider: string,
    workspaceId?: string,
  ): Promise<Array<{ account: string; isDefault: boolean }>> {
    const ws = workspaceId ?? this.defaultWs;
    const creds = await this.backend.list(ws, provider);
    return creds.map((c) => ({
      account: c.account,
      isDefault: c.isDefault ?? false,
    }));
  }

  /** Get the backend (for resolver to call listAll directly). */
  getBackend(): CredentialBackend {
    return this.backend;
  }

  /** Get encryption provider (for resolver). */
  getEncryption(): EncryptionProvider {
    return this.encryption;
  }

  /** Default workspace ID. */
  getDefaultWorkspace(): string {
    return this.defaultWs;
  }
}
