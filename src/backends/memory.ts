// In-memory credential backend — for testing and ephemeral use.

import type { CredentialBackend, StoredCredential } from "./interface.js";

export class MemoryBackend implements CredentialBackend {
  private store = new Map<string, StoredCredential>();

  private key(ws: string, provider: string, account: string): string {
    return `${ws}:${provider}:${account}`;
  }

  async get(
    workspaceId: string,
    provider: string,
    account: string,
  ): Promise<StoredCredential | null> {
    return this.store.get(this.key(workspaceId, provider, account)) ?? null;
  }

  async set(workspaceId: string, cred: StoredCredential): Promise<void> {
    const k = this.key(workspaceId, cred.provider, cred.account);
    this.store.set(k, { ...cred });
  }

  async delete(
    workspaceId: string,
    provider: string,
    account: string,
  ): Promise<void> {
    this.store.delete(this.key(workspaceId, provider, account));
  }

  async list(
    workspaceId: string,
    provider?: string,
  ): Promise<StoredCredential[]> {
    const prefix = provider ? `${workspaceId}:${provider}:` : `${workspaceId}:`;
    return [...this.store.entries()]
      .filter(([k]) => k.startsWith(prefix))
      .map(([, v]) => v);
  }

  async setDefault(
    workspaceId: string,
    provider: string,
    account: string,
  ): Promise<void> {
    // Unset all defaults for this provider
    for (const [k, v] of this.store) {
      if (k.startsWith(`${workspaceId}:${provider}:`) && v.isDefault) {
        v.isDefault = false;
      }
    }
    // Set new default
    const cred = this.store.get(this.key(workspaceId, provider, account));
    if (cred) cred.isDefault = true;
  }

  async listAll(workspaceId: string): Promise<StoredCredential[]> {
    return this.list(workspaceId);
  }

  /** Clear all — for tests. */
  clear(): void {
    this.store.clear();
  }
}
