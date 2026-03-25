// Supabase backend — stores encrypted credentials in Supabase for cloud-first, crash-free persistence.
// Auto-detected when SUPABASE_URL + SUPABASE_SERVICE_KEY env vars are set.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { CredentialBackend, StoredCredential } from "./interface.js";

export interface SupabaseBackendOptions {
  supabaseUrl: string;
  supabaseKey: string;
  tableName?: string;
}

interface CredentialRow {
  id: string;
  workspace_id: string;
  provider: string;
  account: string;
  credential_type: string;
  encrypted_data: string;
  scopes: string[] | null;
  expires_at: string | null;
  is_default: boolean;
  source: string | null;
  created_at: string;
  updated_at: string;
}

interface CacheEntry {
  data: StoredCredential[];
  timestamp: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export class SupabaseBackend implements CredentialBackend {
  private readonly client: SupabaseClient;
  private readonly table: string;
  private readonly cache = new Map<string, CacheEntry>();

  constructor(opts: SupabaseBackendOptions) {
    this.client = createClient(opts.supabaseUrl, opts.supabaseKey);
    this.table = opts.tableName ?? "credential_store";
  }

  /** Visible for testing — inject a mock client. */
  static fromClient(
    client: SupabaseClient,
    tableName?: string,
  ): SupabaseBackend {
    const instance = Object.create(
      SupabaseBackend.prototype,
    ) as SupabaseBackend;
    Object.defineProperty(instance, "client", {
      value: client,
      writable: false,
    });
    Object.defineProperty(instance, "table", {
      value: tableName ?? "credential_store",
      writable: false,
    });
    Object.defineProperty(instance, "cache", {
      value: new Map<string, CacheEntry>(),
      writable: false,
    });
    return instance;
  }

  async get(
    workspaceId: string,
    provider: string,
    account: string,
  ): Promise<StoredCredential | null> {
    const { data, error } = await this.client
      .from(this.table)
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("provider", provider)
      .eq("account", account)
      .maybeSingle();

    if (error) throw new Error(`Supabase get failed: ${error.message}`);
    if (!data) return null;

    return this.rowToCredential(data as CredentialRow);
  }

  async set(workspaceId: string, cred: StoredCredential): Promise<void> {
    const row = this.credentialToRow(workspaceId, cred);

    const { error } = await this.client.from(this.table).upsert(row, {
      onConflict: "workspace_id,provider,account",
    });

    if (error) throw new Error(`Supabase set failed: ${error.message}`);

    this.invalidateCache(workspaceId);
  }

  async delete(
    workspaceId: string,
    provider: string,
    account: string,
  ): Promise<void> {
    const { error } = await this.client
      .from(this.table)
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("provider", provider)
      .eq("account", account);

    if (error) throw new Error(`Supabase delete failed: ${error.message}`);

    this.invalidateCache(workspaceId);
  }

  async list(
    workspaceId: string,
    provider?: string,
  ): Promise<StoredCredential[]> {
    let query = this.client
      .from(this.table)
      .select("*")
      .eq("workspace_id", workspaceId);

    if (provider) {
      query = query.eq("provider", provider);
    }

    const { data, error } = await query;

    if (error) throw new Error(`Supabase list failed: ${error.message}`);

    return (data as CredentialRow[]).map((row) => this.rowToCredential(row));
  }

  async setDefault(
    workspaceId: string,
    provider: string,
    account: string,
  ): Promise<void> {
    // Unset all defaults for this provider in workspace
    const { error: unsetError } = await this.client
      .from(this.table)
      .update({ is_default: false, updated_at: new Date().toISOString() })
      .eq("workspace_id", workspaceId)
      .eq("provider", provider);

    if (unsetError)
      throw new Error(
        `Supabase setDefault unset failed: ${unsetError.message}`,
      );

    // Set the target as default
    const { error: setError } = await this.client
      .from(this.table)
      .update({ is_default: true, updated_at: new Date().toISOString() })
      .eq("workspace_id", workspaceId)
      .eq("provider", provider)
      .eq("account", account);

    if (setError)
      throw new Error(`Supabase setDefault set failed: ${setError.message}`);

    this.invalidateCache(workspaceId);
  }

  async listAll(workspaceId: string): Promise<StoredCredential[]> {
    const cached = this.cache.get(workspaceId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }

    const result = await this.list(workspaceId);
    this.cache.set(workspaceId, { data: result, timestamp: Date.now() });
    return result;
  }

  // ── Mapping ───────────────────────────────────────────────────────────

  private rowToCredential(row: CredentialRow): StoredCredential {
    const encrypted = JSON.parse(row.encrypted_data) as {
      token: string;
      refreshToken?: string;
      groupValues?: Record<string, string>;
    };

    return {
      provider: row.provider,
      account: row.account,
      credentialType: row.credential_type,
      token: encrypted.token,
      refreshToken: encrypted.refreshToken,
      scopes: row.scopes ?? undefined,
      expiresAt: row.expires_at
        ? new Date(row.expires_at).getTime()
        : undefined,
      isDefault: row.is_default,
      groupValues: encrypted.groupValues,
      metadata: {
        storedAt: new Date(row.created_at).getTime(),
        source: row.source ?? undefined,
      },
    };
  }

  private credentialToRow(
    workspaceId: string,
    cred: StoredCredential,
  ): Record<string, unknown> {
    const encryptedData = JSON.stringify({
      token: cred.token,
      refreshToken: cred.refreshToken,
      groupValues: cred.groupValues,
    });

    return {
      workspace_id: workspaceId,
      provider: cred.provider,
      account: cred.account,
      credential_type: cred.credentialType,
      encrypted_data: encryptedData,
      scopes: cred.scopes ?? null,
      expires_at: cred.expiresAt
        ? new Date(cred.expiresAt).toISOString()
        : null,
      is_default: cred.isDefault ?? false,
      source: cred.metadata.source ?? null,
      updated_at: new Date().toISOString(),
    };
  }

  private invalidateCache(workspaceId: string): void {
    this.cache.delete(workspaceId);
  }
}
