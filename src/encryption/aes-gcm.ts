// AES-256-GCM encryption — default provider. Auto-generates key on first use.

import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import type { EncryptionProvider } from "./interface.js";

const KEY_DIR = join(homedir(), ".agent-credentials");
const KEY_FILE = join(KEY_DIR, "key");
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/** Get or auto-generate the encryption key. */
function getKey(): Buffer {
  // 1. Env var override
  const envKey = process.env.AGENT_CREDENTIALS_KEY;
  if (envKey) return Buffer.from(envKey, "hex");

  // 2. Key file
  if (existsSync(KEY_FILE)) {
    return Buffer.from(readFileSync(KEY_FILE, "utf8").trim(), "hex");
  }

  // 3. Auto-generate
  const key = randomBytes(32);
  mkdirSync(KEY_DIR, { recursive: true, mode: 0o700 });
  writeFileSync(KEY_FILE, key.toString("hex"), { mode: 0o600 });
  return key;
}

export class AesGcmEncryption implements EncryptionProvider {
  private key: Buffer;

  constructor(keyHex?: string) {
    this.key = keyHex ? Buffer.from(keyHex, "hex") : getKey();
    if (this.key.length !== 32) {
      throw new Error("Encryption key must be 32 bytes (64 hex chars)");
    }
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    const encrypted = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    // Format: base64(iv + tag + ciphertext)
    return Buffer.concat([iv, tag, encrypted]).toString("base64");
  }

  decrypt(ciphertext: string): string {
    const buf = Buffer.from(ciphertext, "base64");
    const iv = buf.subarray(0, IV_LENGTH);
    const tag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
    const decipher = createDecipheriv(ALGORITHM, this.key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    decipher.setAuthTag(tag);
    return decipher.update(encrypted) + decipher.final("utf8");
  }
}
