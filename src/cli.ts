// CLI entry — add/remove/list/inject/scan/init/check/version/uninstall.

import { CredentialStore } from "./store.js";
import { FileBackend } from "./backends/file.js";
import { AesGcmEncryption } from "./encryption/aes-gcm.js";
import {
  resolveEnv,
  formatInject,
  formatDryRun,
  type OutputFormat,
} from "./resolver.js";
import { EnvScanner } from "./scanners/env.js";
import { DotenvScanner } from "./scanners/dotenv.js";
import { GitHubScanner } from "./scanners/github.js";
import { AwsScanner } from "./scanners/aws.js";
import type { CredentialScanner } from "./scanners/interface.js";
import { existsSync, readFileSync, unlinkSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// ── Store factory ───────────────────────────────────────────────────────────

function createStore(): CredentialStore {
  return new CredentialStore({
    backend: new FileBackend(),
    encryption: new AesGcmEncryption(),
  });
}

// ── Scanners ────────────────────────────────────────────────────────────────

function getAllScanners(): CredentialScanner[] {
  return [
    new EnvScanner(),
    new DotenvScanner(),
    new GitHubScanner(),
    new AwsScanner(),
  ];
}

// ── Commands ────────────────────────────────────────────────────────────────

async function cmdScan(quiet: boolean): Promise<void> {
  const store = createStore();
  const scanners = getAllScanners();
  let total = 0;

  for (const scanner of scanners) {
    if (!(await scanner.detect())) continue;
    const creds = await scanner.scan();
    for (const c of creds) {
      await store.set({
        provider: c.provider,
        account: c.account,
        credentialType: c.credentialType,
        token: c.value,
        expiresAt: c.expiresAt,
        groupValues: c.groupValues,
        source: c.source,
      });
      total++;
    }
  }

  if (!quiet) {
    if (total > 0) {
      console.log(
        `Discovered ${total} credential(s) from ${scanners.length} sources.`,
      );
    } else {
      console.log(
        "No credentials found. Use: agent-credentials add <provider> --token <value>",
      );
    }
  }
}

async function cmdAdd(args: string[]): Promise<void> {
  const provider = args[0];
  if (!provider) {
    console.error(
      "Usage: agent-credentials add <provider> [--account <name>] --token <value>",
    );
    process.exit(1);
  }

  let account = "default";
  let token = "";
  let credType = "api_key";

  for (let i = 1; i < args.length; i++) {
    if (args[i] === "--account" && args[i + 1]) {
      account = args[++i]!;
    } else if (args[i] === "--token" && args[i + 1]) {
      token = args[++i]!;
    } else if (args[i] === "--type" && args[i + 1]) {
      credType = args[++i]!;
    }
  }

  if (!token) {
    console.error("--token is required");
    process.exit(1);
  }

  const store = createStore();
  await store.set({
    provider,
    account,
    credentialType: credType,
    token,
    source: "cli:add",
  });
  console.log(`Stored ${provider}/${account} (${credType})`);
}

async function cmdRemove(args: string[]): Promise<void> {
  const provider = args[0];
  const account = args[1] ?? "default";
  if (!provider) {
    console.error("Usage: agent-credentials remove <provider> [account]");
    process.exit(1);
  }
  const store = createStore();
  await store.delete(provider, account);
  console.log(`Removed ${provider}/${account}`);
}

async function cmdList(args: string[]): Promise<void> {
  const store = createStore();
  const list = await store.list(args[0]);
  if (list.length === 0) {
    console.log("No credentials stored.");
    return;
  }
  for (const c of list) {
    const def = c.isDefault ? " (default)" : "";
    const exp = c.isExpired ? " [EXPIRED]" : "";
    console.log(
      `  ${c.provider}/${c.account} [${c.credentialType}]${def}${exp}`,
    );
  }
}

async function cmdAccounts(args: string[]): Promise<void> {
  const provider = args[0];
  if (!provider) {
    console.error("Usage: agent-credentials accounts <provider>");
    process.exit(1);
  }
  const store = createStore();
  const accounts = await store.accounts(provider);
  if (accounts.length === 0) {
    console.log(`No accounts for ${provider}.`);
    return;
  }
  for (const a of accounts) {
    console.log(`  ${a.isDefault ? "* " : "  "}${a.account}`);
  }
}

async function cmdSetDefault(args: string[]): Promise<void> {
  const [provider, account] = args;
  if (!provider || !account) {
    console.error("Usage: agent-credentials set-default <provider> <account>");
    process.exit(1);
  }
  const store = createStore();
  await store.setDefault(provider, account);
  console.log(`Default for ${provider} set to ${account}`);
}

async function cmdInject(args: string[]): Promise<void> {
  const store = createStore();

  // Auto-scan if store is empty
  const all = await store.list();
  if (all.length === 0) {
    await cmdScan(true);
  }

  let format: OutputFormat = "shell";
  let dryRun = false;
  let workspace: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--json") format = "json";
    else if (args[i] === "--fish") format = "fish";
    else if (args[i] === "--dry-run") dryRun = true;
    else if (args[i] === "--workspace" && args[i + 1]) workspace = args[++i];
  }

  const env = await resolveEnv(store, workspace);

  if (dryRun) {
    console.log(formatDryRun(env));
  } else {
    const output = formatInject(env, format);
    if (output) process.stdout.write(output + "\n");
  }
}

async function cmdInit(): Promise<void> {
  // Detect shell
  const shell = process.env.SHELL ?? "";
  const evalLine = 'eval "$(agent-credentials inject)"';
  let profilePath: string | null = null;

  if (shell.includes("zsh")) {
    profilePath = join(homedir(), ".zshrc");
  } else if (shell.includes("bash")) {
    profilePath = join(homedir(), ".bashrc");
  } else if (shell.includes("fish")) {
    profilePath = join(homedir(), ".config", "fish", "config.fish");
  }

  if (profilePath && existsSync(profilePath)) {
    const content = readFileSync(profilePath, "utf8");
    if (content.includes("agent-credentials inject")) {
      console.log("Already configured in " + profilePath);
    } else {
      appendFileSync(profilePath, `\n# agent-credentials\n${evalLine}\n`);
      console.log(`Added to ${profilePath}`);
    }
  } else {
    console.log(`Add to your shell profile:\n  ${evalLine}`);
  }

  // Run first scan + inject
  await cmdScan(false);
}

async function cmdCheck(): Promise<void> {
  const store = createStore();
  const list = await store.list();
  if (list.length === 0) {
    console.log("No credentials stored.");
    return;
  }
  let issues = 0;
  for (const c of list) {
    if (c.isExpired) {
      console.log(`  ⚠ ${c.provider}/${c.account} — EXPIRED`);
      issues++;
    } else {
      console.log(`  ✓ ${c.provider}/${c.account}`);
    }
  }
  if (issues > 0) {
    console.log(`\n${issues} credential(s) expired.`);
  } else {
    console.log(`\nAll ${list.length} credential(s) healthy.`);
  }
}

function cmdVersion(): void {
  try {
    const pkg = JSON.parse(
      readFileSync(
        join(import.meta.dirname ?? __dirname, "..", "package.json"),
        "utf8",
      ),
    ) as { version: string };
    console.log(pkg.version);
  } catch {
    console.log("unknown");
  }
}

async function cmdUninstall(): Promise<void> {
  const dir = join(homedir(), ".agent-credentials");
  const { rmSync } = await import("node:fs");
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
    console.log(`Removed ${dir}`);
  }

  // Remove from shell profiles
  for (const profile of [
    join(homedir(), ".zshrc"),
    join(homedir(), ".bashrc"),
    join(homedir(), ".config", "fish", "config.fish"),
  ]) {
    if (!existsSync(profile)) continue;
    const content = readFileSync(profile, "utf8");
    if (content.includes("agent-credentials")) {
      const cleaned = content
        .split("\n")
        .filter((l) => !l.includes("agent-credentials"))
        .join("\n");
      const { writeFileSync } = await import("node:fs");
      writeFileSync(profile, cleaned);
      console.log(`Cleaned ${profile}`);
    }
  }
  console.log("Uninstalled.");
}

// ── Main dispatch ───────────────────────────────────────────────────────────

export async function main(argv: string[]): Promise<void> {
  const [cmd, ...args] = argv;

  switch (cmd) {
    case "scan":
      return cmdScan(args.includes("--quiet"));
    case "add":
      return cmdAdd(args);
    case "remove":
      return cmdRemove(args);
    case "list":
      return cmdList(args);
    case "accounts":
      return cmdAccounts(args);
    case "set-default":
      return cmdSetDefault(args);
    case "inject":
      return cmdInject(args);
    case "init":
      return cmdInit();
    case "check":
      return cmdCheck();
    case "version":
    case "--version":
    case "-v":
      cmdVersion();
      return;
    case "uninstall":
      return cmdUninstall();
    case "help":
    case "--help":
    case "-h":
      console.log(`agent-credentials — Universal credential injector for AI agents

Usage:
  agent-credentials                         Setup (scan + hook shell)
  agent-credentials inject [--json|--fish]  Output env var exports
  agent-credentials scan                    Re-scan all sources
  agent-credentials add <provider> --token <value>
  agent-credentials remove <provider> [account]
  agent-credentials list [provider]
  agent-credentials accounts <provider>
  agent-credentials set-default <provider> <account>
  agent-credentials keychain <provider>     Switch keychain (1password, bitwarden)
  agent-credentials check                   Health check
  agent-credentials version
  agent-credentials uninstall`);
      return;
    default:
      // No command = init (scan + hook shell). True one-command setup.
      return cmdInit();
  }
}
