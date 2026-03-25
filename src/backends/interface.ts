// Credential backend interface — pluggable storage for credentials.

export interface StoredCredential {
  provider: string;
  account: string;
  credentialType: string;
  token: string;
  refreshToken?: string;
  scopes?: string[];
  expiresAt?: number;
  isDefault?: boolean;
  /** Group values — paired credentials (e.g., AWS key + secret). */
  groupValues?: Record<string, string>;
  metadata: CredentialMetadata;
}

export interface CredentialMetadata {
  storedAt: number;
  storedBy?: string;
  lastUsedAt?: number;
  source?: string;
}

export interface CredentialBackend {
  get(
    workspaceId: string,
    provider: string,
    account: string,
  ): Promise<StoredCredential | null>;

  set(workspaceId: string, cred: StoredCredential): Promise<void>;

  delete(workspaceId: string, provider: string, account: string): Promise<void>;

  list(workspaceId: string, provider?: string): Promise<StoredCredential[]>;

  setDefault(
    workspaceId: string,
    provider: string,
    account: string,
  ): Promise<void>;

  /** Bulk fetch all credentials for a workspace — used by resolveEnv. */
  listAll(workspaceId: string): Promise<StoredCredential[]>;
}
