// macOS Keychain provider — uses `security` CLI. Zero config on macOS.

import { execFileSync } from "node:child_process";
import type { KeychainProvider } from "./interface.js";
import { KEYCHAIN_SERVICE_PREFIX } from "./interface.js";

export class MacOSKeychainProvider implements KeychainProvider {
  name = "macos";

  async detect(): Promise<boolean> {
    if (process.platform !== "darwin") return false;
    try {
      execFileSync("which", ["security"], { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  }

  async get(service: string, account: string): Promise<string | null> {
    try {
      const result = execFileSync(
        "security",
        ["find-generic-password", "-s", service, "-a", account, "-w"],
        { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] },
      );
      return result.trim() || null;
    } catch {
      return null;
    }
  }

  async set(service: string, account: string, value: string): Promise<void> {
    // Delete first (upsert — security add-generic-password fails if exists)
    try {
      execFileSync(
        "security",
        ["delete-generic-password", "-s", service, "-a", account],
        { stdio: "ignore" },
      );
    } catch {
      // Not found — fine
    }

    execFileSync(
      "security",
      [
        "add-generic-password",
        "-s",
        service,
        "-a",
        account,
        "-w",
        value,
        "-U", // update if exists (belt + suspenders with delete above)
      ],
      { stdio: "ignore" },
    );
  }

  async delete(service: string, account: string): Promise<void> {
    try {
      execFileSync(
        "security",
        ["delete-generic-password", "-s", service, "-a", account],
        { stdio: "ignore" },
      );
    } catch {
      // Not found — fine
    }
  }

  async list(servicePrefix: string): Promise<string[]> {
    try {
      const result = execFileSync("security", ["dump-keychain"], {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "ignore"],
        maxBuffer: 10 * 1024 * 1024,
      });

      const accounts: string[] = [];
      let currentService = "";
      for (const line of result.split("\n")) {
        const svcMatch = line.match(/"svce"<blob>="([^"]+)"/);
        if (svcMatch) currentService = svcMatch[1] ?? "";

        const acctMatch = line.match(/"acct"<blob>="([^"]+)"/);
        if (acctMatch && currentService.startsWith(servicePrefix)) {
          accounts.push(acctMatch[1] ?? "");
        }
      }

      return [...new Set(accounts)];
    } catch {
      return [];
    }
  }
}
