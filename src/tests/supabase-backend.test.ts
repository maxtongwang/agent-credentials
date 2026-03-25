// Tests for SupabaseBackend — CRUD, caching, workspace isolation, using a mock Supabase client.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { SupabaseBackend } from "../backends/supabase.js";
import type { StoredCredential } from "../backends/interface.js";
import type { SupabaseClient } from "@supabase/supabase-js";

// ── Mock Supabase client ──────────────────────────────────────────────────

interface MockRow {
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

function createMockClient(): SupabaseClient {
  const rows: MockRow[] = [];
  let idCounter = 0;

  function findIndex(ws: string, provider: string, account: string): number {
    return rows.findIndex(
      (r) =>
        r.workspace_id === ws &&
        r.provider === provider &&
        r.account === account,
    );
  }

  /** Build a chainable query builder that tracks .eq() filters and resolves on terminal call. */
  function queryBuilder(
    operation: "select" | "upsert" | "delete" | "update",
    payload?: Record<string, unknown>,
  ) {
    const filters: Array<{ column: string; value: string }> = [];

    const negFilters: Array<{ column: string; value: string }> = [];

    const builder = {
      eq(column: string, value: string) {
        filters.push({ column, value });
        return builder;
      },

      neq(column: string, value: string) {
        negFilters.push({ column, value });
        return builder;
      },

      select(_sel?: string) {
        return builder;
      },

      maybeSingle() {
        const matching = rows.filter((r) =>
          filters.every(
            (f) => String(r[f.column as keyof MockRow]) === String(f.value),
          ),
        );
        return Promise.resolve({
          data: matching[0] ?? null,
          error: null,
        });
      },

      // Terminal for select without maybeSingle — returns array
      then(
        resolve: (value: { data: MockRow[]; error: null }) => void,
        _reject?: (reason: unknown) => void,
      ) {
        if (operation === "select") {
          const matching = rows.filter((r) =>
            filters.every(
              (f) => String(r[f.column as keyof MockRow]) === String(f.value),
            ),
          );
          resolve({ data: matching, error: null });
        } else if (operation === "delete") {
          const toRemove: number[] = [];
          for (let i = rows.length - 1; i >= 0; i--) {
            const r = rows[i]!;
            if (
              filters.every(
                (f) => String(r[f.column as keyof MockRow]) === String(f.value),
              )
            ) {
              toRemove.push(i);
            }
          }
          for (const idx of toRemove) {
            rows.splice(idx, 1);
          }
          resolve({ data: [], error: null });
        } else if (operation === "update" && payload) {
          for (const r of rows) {
            if (
              filters.every(
                (f) => String(r[f.column as keyof MockRow]) === String(f.value),
              ) &&
              negFilters.every(
                (f) => String(r[f.column as keyof MockRow]) !== String(f.value),
              )
            ) {
              Object.assign(r, payload);
            }
          }
          resolve({ data: [], error: null });
        } else if (operation === "upsert" && payload) {
          // upsert handled in from().upsert() directly
          resolve({ data: [], error: null });
        }
      },
    };

    return builder;
  }

  const client = {
    from(_table: string) {
      return {
        select(sel?: string) {
          return queryBuilder("select").select(sel);
        },

        upsert(row: Record<string, unknown>, _opts?: { onConflict: string }) {
          const ws = row.workspace_id as string;
          const provider = row.provider as string;
          const account = row.account as string;
          const idx = findIndex(ws, provider, account);

          if (idx >= 0) {
            rows[idx] = { ...rows[idx]!, ...row } as MockRow;
          } else {
            idCounter++;
            rows.push({
              id: `mock-${idCounter}`,
              created_at: new Date().toISOString(),
              ...row,
            } as MockRow);
          }

          return Promise.resolve({ data: null, error: null });
        },

        delete() {
          return queryBuilder("delete");
        },

        update(payload: Record<string, unknown>) {
          return queryBuilder("update", payload);
        },
      };
    },
  };

  return client as unknown as SupabaseClient;
}

// ── Helpers ─────────────────────────────────────────────────────────────

function makeCred(overrides?: Partial<StoredCredential>): StoredCredential {
  return {
    provider: "anthropic",
    account: "default",
    credentialType: "api_key",
    token: "enc-token-abc",
    scopes: undefined,
    expiresAt: undefined,
    isDefault: false,
    metadata: { storedAt: Date.now(), source: "cli:add" },
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────────────

let backend: SupabaseBackend;
let mockClient: SupabaseClient;

beforeEach(() => {
  mockClient = createMockClient();
  backend = SupabaseBackend.fromClient(mockClient);
});

describe("SupabaseBackend CRUD", () => {
  it("get() returns null when credential does not exist", async () => {
    const result = await backend.get("ws-1", "anthropic", "default");
    expect(result).toBeNull();
  });

  it("set() + get() round-trips a credential", async () => {
    const cred = makeCred();
    await backend.set("ws-1", cred);

    const result = await backend.get("ws-1", "anthropic", "default");
    expect(result).not.toBeNull();
    expect(result!.provider).toBe("anthropic");
    expect(result!.account).toBe("default");
    expect(result!.token).toBe("enc-token-abc");
    expect(result!.credentialType).toBe("api_key");
  });

  it("set() upserts on same (workspace_id, provider, account)", async () => {
    await backend.set("ws-1", makeCred({ token: "old-token" }));
    await backend.set("ws-1", makeCred({ token: "new-token" }));

    const result = await backend.get("ws-1", "anthropic", "default");
    expect(result!.token).toBe("new-token");

    // Only one row
    const all = await backend.list("ws-1");
    expect(all).toHaveLength(1);
  });

  it("delete() removes the credential", async () => {
    await backend.set("ws-1", makeCred());
    await backend.delete("ws-1", "anthropic", "default");

    const result = await backend.get("ws-1", "anthropic", "default");
    expect(result).toBeNull();
  });

  it("preserves refreshToken and groupValues in encrypted_data", async () => {
    const cred = makeCred({
      refreshToken: "enc-refresh",
      groupValues: { AWS_SECRET: "enc-secret" },
    });
    await backend.set("ws-1", cred);

    const result = await backend.get("ws-1", "anthropic", "default");
    expect(result!.refreshToken).toBe("enc-refresh");
    expect(result!.groupValues).toEqual({ AWS_SECRET: "enc-secret" });
  });

  it("preserves scopes, expiresAt, isDefault, source", async () => {
    const cred = makeCred({
      scopes: ["read", "write"],
      expiresAt: 1700000000000,
      isDefault: true,
      metadata: { storedAt: Date.now(), source: "oauth:google" },
    });
    await backend.set("ws-1", cred);

    const result = await backend.get("ws-1", "anthropic", "default");
    expect(result!.scopes).toEqual(["read", "write"]);
    expect(result!.expiresAt).toBe(1700000000000);
    expect(result!.isDefault).toBe(true);
    expect(result!.metadata.source).toBe("oauth:google");
  });
});

describe("list and listAll", () => {
  it("list() returns only matching workspace credentials", async () => {
    await backend.set("ws-1", makeCred({ provider: "anthropic" }));
    await backend.set("ws-1", makeCred({ provider: "openai" }));
    await backend.set("ws-2", makeCred({ provider: "anthropic" }));

    const ws1All = await backend.list("ws-1");
    expect(ws1All).toHaveLength(2);
  });

  it("list() filters by provider when specified", async () => {
    await backend.set("ws-1", makeCred({ provider: "anthropic" }));
    await backend.set("ws-1", makeCred({ provider: "openai" }));

    const anthropicOnly = await backend.list("ws-1", "anthropic");
    expect(anthropicOnly).toHaveLength(1);
    expect(anthropicOnly[0]!.provider).toBe("anthropic");
  });

  it("listAll() returns all workspace credentials", async () => {
    await backend.set("ws-1", makeCred({ provider: "anthropic" }));
    await backend.set(
      "ws-1",
      makeCred({ provider: "openai", account: "default" }),
    );

    const all = await backend.listAll("ws-1");
    expect(all).toHaveLength(2);
  });
});

describe("setDefault", () => {
  it("sets is_default correctly", async () => {
    await backend.set(
      "ws-1",
      makeCred({
        provider: "google",
        account: "work@co.com",
        isDefault: true,
      }),
    );
    await backend.set(
      "ws-1",
      makeCred({
        provider: "google",
        account: "personal@co.com",
        isDefault: false,
      }),
    );

    await backend.setDefault("ws-1", "google", "personal@co.com");

    const work = await backend.get("ws-1", "google", "work@co.com");
    const personal = await backend.get("ws-1", "google", "personal@co.com");

    expect(work!.isDefault).toBe(false);
    expect(personal!.isDefault).toBe(true);
  });
});

describe("cache", () => {
  it("uses cache on repeated listAll() calls", async () => {
    await backend.set("ws-1", makeCred());

    const fromSpy = vi.spyOn(mockClient, "from");

    // First call — cache miss, hits DB
    const first = await backend.listAll("ws-1");
    const callsAfterFirst = fromSpy.mock.calls.length;

    // Second call — cache hit, no new DB call
    const second = await backend.listAll("ws-1");
    expect(fromSpy.mock.calls.length).toBe(callsAfterFirst);

    expect(first).toEqual(second);

    fromSpy.mockRestore();
  });

  it("invalidates cache on set()", async () => {
    await backend.set("ws-1", makeCred({ token: "v1" }));

    // Populate cache
    await backend.listAll("ws-1");

    // Write invalidates cache
    await backend.set("ws-1", makeCred({ token: "v2" }));

    // Next listAll should see updated data
    const result = await backend.listAll("ws-1");
    expect(result[0]!.token).toBe("v2");
  });

  it("invalidates cache on delete()", async () => {
    await backend.set("ws-1", makeCred());

    // Populate cache
    await backend.listAll("ws-1");

    // Delete invalidates cache
    await backend.delete("ws-1", "anthropic", "default");

    // Next listAll should see empty
    const result = await backend.listAll("ws-1");
    expect(result).toHaveLength(0);
  });
});

describe("workspace isolation", () => {
  it('list("ws-1") does not return ws-2 credentials', async () => {
    await backend.set("ws-1", makeCred({ token: "ws1-token" }));
    await backend.set("ws-2", makeCred({ token: "ws2-token" }));

    const ws1 = await backend.list("ws-1");
    const ws2 = await backend.list("ws-2");

    expect(ws1).toHaveLength(1);
    expect(ws1[0]!.token).toBe("ws1-token");
    expect(ws2).toHaveLength(1);
    expect(ws2[0]!.token).toBe("ws2-token");
  });

  it("get() from wrong workspace returns null", async () => {
    await backend.set("ws-1", makeCred());

    const result = await backend.get("ws-2", "anthropic", "default");
    expect(result).toBeNull();
  });

  it("delete() in one workspace does not affect another", async () => {
    await backend.set("ws-1", makeCred());
    await backend.set("ws-2", makeCred());

    await backend.delete("ws-1", "anthropic", "default");

    expect(await backend.get("ws-1", "anthropic", "default")).toBeNull();
    expect(await backend.get("ws-2", "anthropic", "default")).not.toBeNull();
  });
});
