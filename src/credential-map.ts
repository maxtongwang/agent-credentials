// Credential map — tracks canonical sources and propagates to tool-specific config paths.
// Auth once with any tool → agent-credentials copies to every other tool's expected path.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

// ── Types ────────────────────────────────────────────────────────────────────

export interface CredentialMapping {
  /** Provider (google, github, aws, etc.) */
  provider: string;
  /** Credential type (oauth_token, api_key, etc.) */
  credentialType: string;
  /** Account identifier */
  account: string;
  /** Canonical source — where the credential was originally created */
  canonicalPath: string;
  /** Tool-specific config paths we've copied to */
  copies: string[];
  /** When the canonical source was last read */
  lastReadAt: number;
}

export interface ToolConfigPath {
  /** Tool name (gogcli, opencli, gcloud, gh, aws, etc.) */
  tool: string;
  /** Provider this path is for */
  provider: string;
  /** Credential type */
  credentialType: string;
  /** Path where the tool expects its config (supports ~ for homedir) */
  path: string;
  /** How to read the credential from this file */
  read: (content: string) => string | null;
  /** How to write the credential into this file format */
  write: (token: string, existing?: string) => string;
}

// ── Known tool config paths ─────────────────────────────────────────────────

const HOME = homedir();

export const KNOWN_TOOL_PATHS: ToolConfigPath[] = [
  // GitHub
  {
    tool: "gh",
    provider: "github",
    credentialType: "personal_token",
    path: join(HOME, ".config", "gh", "hosts.yml"),
    read: (content) => {
      const match = content.match(/oauth_token:\s*(.+)/);
      return match?.[1]?.trim() ?? null;
    },
    write: (token) =>
      `github.com:\n    oauth_token: ${token}\n    user: \n    git_protocol: https\n`,
  },
  // AWS
  {
    tool: "aws",
    provider: "aws",
    credentialType: "access_key",
    path: join(HOME, ".aws", "credentials"),
    read: (content) => {
      const match = content.match(/aws_access_key_id\s*=\s*(.+)/);
      return match?.[1]?.trim() ?? null;
    },
    write: (token, existing) => {
      // Token is JSON: { accessKeyId, secretAccessKey }
      try {
        const { accessKeyId, secretAccessKey } = JSON.parse(token) as {
          accessKeyId: string;
          secretAccessKey: string;
        };
        const profile =
          "[default]\naws_access_key_id = " +
          accessKeyId +
          "\naws_secret_access_key = " +
          secretAccessKey +
          "\n";
        return existing ? existing + "\n" + profile : profile;
      } catch {
        return existing ?? "";
      }
    },
  },
  // Google Cloud (gcloud)
  {
    tool: "gcloud",
    provider: "google",
    credentialType: "oauth_token",
    path: join(
      HOME,
      ".config",
      "gcloud",
      "application_default_credentials.json",
    ),
    read: (content) => {
      try {
        const data = JSON.parse(content) as {
          access_token?: string;
          client_secret?: string;
        };
        return data.access_token ?? data.client_secret ?? null;
      } catch {
        return null;
      }
    },
    write: (token) =>
      JSON.stringify({ type: "authorized_user", access_token: token }, null, 2),
  },
];

// ── Map persistence ─────────────────────────────────────────────────────────

const MAP_FILE = join(HOME, ".agent-credentials", "credential-map.json");

function loadMap(): CredentialMapping[] {
  try {
    if (existsSync(MAP_FILE)) {
      return JSON.parse(readFileSync(MAP_FILE, "utf8")) as CredentialMapping[];
    }
  } catch {
    // Corrupted — start fresh
  }
  return [];
}

function saveMap(mappings: CredentialMapping[]): void {
  const dir = dirname(MAP_FILE);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeFileSync(MAP_FILE, JSON.stringify(mappings, null, 2), { mode: 0o600 });
}

// ── Core operations ─────────────────────────────────────────────────────────

/**
 * Register a canonical credential source.
 * Called when a scanner discovers a credential in a tool's config file.
 */
export function registerCanonical(
  provider: string,
  credentialType: string,
  account: string,
  canonicalPath: string,
): void {
  const mappings = loadMap();
  const existing = mappings.find(
    (m) =>
      m.provider === provider &&
      m.credentialType === credentialType &&
      m.account === account,
  );

  if (existing) {
    existing.canonicalPath = canonicalPath;
    existing.lastReadAt = Date.now();
  } else {
    mappings.push({
      provider,
      credentialType,
      account,
      canonicalPath,
      copies: [],
      lastReadAt: Date.now(),
    });
  }

  saveMap(mappings);
}

/**
 * Read credential value from its canonical source.
 * Returns the live value — not a cached copy.
 */
export function readFromCanonical(
  provider: string,
  credentialType: string,
  account: string,
): string | null {
  const mappings = loadMap();
  const mapping = mappings.find(
    (m) =>
      m.provider === provider &&
      m.credentialType === credentialType &&
      m.account === account,
  );

  if (!mapping) return null;
  if (!existsSync(mapping.canonicalPath)) return null;

  // Find the reader for this path
  const toolPath = KNOWN_TOOL_PATHS.find(
    (tp) => tp.path === mapping.canonicalPath && tp.provider === provider,
  );

  if (!toolPath) {
    // Generic: try reading as plain text (env var file, JSON value, etc.)
    try {
      return readFileSync(mapping.canonicalPath, "utf8").trim();
    } catch {
      return null;
    }
  }

  try {
    const content = readFileSync(mapping.canonicalPath, "utf8");
    return toolPath.read(content);
  } catch {
    return null;
  }
}

/**
 * Propagate a credential to all known tool config paths that need it.
 * Skips the canonical source (already has it). Creates config dirs as needed.
 */
export function propagateToTools(
  provider: string,
  credentialType: string,
  account: string,
  token: string,
): string[] {
  const mappings = loadMap();
  const mapping = mappings.find(
    (m) =>
      m.provider === provider &&
      m.credentialType === credentialType &&
      m.account === account,
  );

  const populated: string[] = [];

  for (const toolPath of KNOWN_TOOL_PATHS) {
    if (
      toolPath.provider !== provider ||
      toolPath.credentialType !== credentialType
    ) {
      continue;
    }

    // Skip canonical source
    if (mapping && toolPath.path === mapping.canonicalPath) continue;

    // Skip if tool already has a valid credential
    if (existsSync(toolPath.path)) {
      try {
        const existing = readFileSync(toolPath.path, "utf8");
        const existingToken = toolPath.read(existing);
        if (existingToken) continue; // Already has credential — don't overwrite
      } catch {
        // Can't read — will overwrite
      }
    }

    // Write credential in tool's expected format
    try {
      const dir = dirname(toolPath.path);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });

      const existing = existsSync(toolPath.path)
        ? readFileSync(toolPath.path, "utf8")
        : undefined;
      const content = toolPath.write(token, existing);
      writeFileSync(toolPath.path, content, { mode: 0o600 });

      populated.push(toolPath.path);

      // Track in map
      if (mapping && !mapping.copies.includes(toolPath.path)) {
        mapping.copies.push(toolPath.path);
      }
    } catch {
      // Non-fatal — tool path may be unwritable
    }
  }

  if (mapping) saveMap(mappings);
  return populated;
}

/**
 * Check if we already have a credential for a provider.
 * Used to skip auth flows for tools that need the same provider.
 */
export function hasCredential(
  provider: string,
  credentialType: string,
  account?: string,
): boolean {
  const mappings = loadMap();
  return mappings.some(
    (m) =>
      m.provider === provider &&
      m.credentialType === credentialType &&
      (account ? m.account === account : true),
  );
}

/**
 * Get the full credential map (for diagnostics).
 */
export function getMap(): CredentialMapping[] {
  return loadMap();
}

/**
 * Register a custom tool config path (for tools not in KNOWN_TOOL_PATHS).
 */
export function registerToolPath(toolPath: ToolConfigPath): void {
  KNOWN_TOOL_PATHS.push(toolPath);
}
