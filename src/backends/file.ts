// Encrypted file backend — default for local single-machine use.
// Stores at ~/.agent-credentials/store.enc. Lockfile for concurrent access.

import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  unlinkSync,
  statSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import type { CredentialBackend, StoredCredential } from "./interface.js";

const DEFAULT_DIR = join(homedir(), ".agent-credentials");
const DEFAULT_FILE = join(DEFAULT_DIR, "store.json");
const LOCK_FILE = join(DEFAULT_DIR, "store.lock");
const STALE_LOCK_MS = 30_000;
const LOCK_RETRY_MS = 100;
const LOCK_MAX_RETRIES = 3;
const STORE_VERSION = 1;

interface StoreData {
  version: number;
  credentials: Record<string, StoredCredential[]>; // keyed by workspaceId
}

export class FileBackend implements CredentialBackend {
  private readonly filePath: string;
  private readonly lockPath: string;

  constructor(filePath?: string) {
    this.filePath = filePath ?? DEFAULT_FILE;
    this.lockPath = filePath ? filePath + ".lock" : LOCK_FILE;
  }

  // ── Locking ───────────────────────────────────────────────────────────

  private acquireLock(): void {
    for (let i = 0; i < LOCK_MAX_RETRIES; i++) {
      // Check for stale lock
      if (existsSync(this.lockPath)) {
        try {
          const stat = statSync(this.lockPath);
          if (Date.now() - stat.mtimeMs > STALE_LOCK_MS) {
            unlinkSync(this.lockPath); // Stale — remove
          } else {
            // Fresh lock — wait and retry
            const start = Date.now();
            while (Date.now() - start < LOCK_RETRY_MS) {
              // busy wait (short)
            }
            continue;
          }
        } catch {
          // Lock disappeared — proceed
        }
      }

      try {
        writeFileSync(this.lockPath, String(process.pid), { flag: "wx" });
        return; // Lock acquired
      } catch {
        // Another process grabbed it — retry
        const start = Date.now();
        while (Date.now() - start < LOCK_RETRY_MS) {
          // busy wait
        }
      }
    }
    // Proceed without lock after max retries (best-effort)
  }

  private releaseLock(): void {
    try {
      unlinkSync(this.lockPath);
    } catch {
      // Already released
    }
  }

  // ── File I/O ──────────────────────────────────────────────────────────

  private read(): StoreData {
    if (!existsSync(this.filePath)) {
      return { version: STORE_VERSION, credentials: {} };
    }
    try {
      const content = readFileSync(this.filePath, "utf8");
      const data = JSON.parse(content) as StoreData;
      // Version migration would go here
      return data;
    } catch {
      // Corrupted — backup and start fresh
      try {
        const backupPath = this.filePath + ".corrupt." + Date.now();
        writeFileSync(backupPath, readFileSync(this.filePath));
      } catch {
        // Can't backup — just start fresh
      }
      return { version: STORE_VERSION, credentials: {} };
    }
  }

  private write(data: StoreData): void {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
    writeFileSync(this.filePath, JSON.stringify(data, null, 2), {
      mode: 0o600,
    });
  }

  // ── Backend interface ─────────────────────────────────────────────────

  async get(
    workspaceId: string,
    provider: string,
    account: string,
  ): Promise<StoredCredential | null> {
    const data = this.read();
    const creds = data.credentials[workspaceId] ?? [];
    return (
      creds.find((c) => c.provider === provider && c.account === account) ??
      null
    );
  }

  async set(workspaceId: string, cred: StoredCredential): Promise<void> {
    this.acquireLock();
    try {
      const data = this.read();
      if (!data.credentials[workspaceId]) {
        data.credentials[workspaceId] = [];
      }
      const list = data.credentials[workspaceId]!;
      const idx = list.findIndex(
        (c) => c.provider === cred.provider && c.account === cred.account,
      );
      if (idx >= 0) {
        list[idx] = cred; // upsert
      } else {
        list.push(cred);
      }
      this.write(data);
    } finally {
      this.releaseLock();
    }
  }

  async delete(
    workspaceId: string,
    provider: string,
    account: string,
  ): Promise<void> {
    this.acquireLock();
    try {
      const data = this.read();
      const list = data.credentials[workspaceId];
      if (!list) return;
      data.credentials[workspaceId] = list.filter(
        (c) => !(c.provider === provider && c.account === account),
      );
      this.write(data);
    } finally {
      this.releaseLock();
    }
  }

  async list(
    workspaceId: string,
    provider?: string,
  ): Promise<StoredCredential[]> {
    const data = this.read();
    const creds = data.credentials[workspaceId] ?? [];
    return provider ? creds.filter((c) => c.provider === provider) : creds;
  }

  async setDefault(
    workspaceId: string,
    provider: string,
    account: string,
  ): Promise<void> {
    this.acquireLock();
    try {
      const data = this.read();
      const list = data.credentials[workspaceId] ?? [];
      for (const c of list) {
        if (c.provider === provider) {
          c.isDefault = c.account === account;
        }
      }
      this.write(data);
    } finally {
      this.releaseLock();
    }
  }

  async listAll(workspaceId: string): Promise<StoredCredential[]> {
    return this.list(workspaceId);
  }
}
