// 1Password keychain provider — uses `op` CLI.

import { execFileSync } from "node:child_process";
import type { KeychainProvider } from "./interface.js";

export class OnePasswordProvider implements KeychainProvider {
  name = "1password";

  async detect(): Promise<boolean> {
    try {
      execFileSync("op", ["--version"], { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  }

  async get(service: string, account: string): Promise<string | null> {
    try {
      const itemName = `${service}/${account}`;
      const result = execFileSync(
        "op",
        ["item", "get", itemName, "--fields", "password", "--format", "json"],
        { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] },
      );
      const parsed = JSON.parse(result) as { value?: string };
      return parsed.value ?? null;
    } catch {
      return null;
    }
  }

  async set(service: string, account: string, value: string): Promise<void> {
    const itemName = `${service}/${account}`;
    try {
      // Try edit first (update existing)
      execFileSync("op", ["item", "edit", itemName, `password=${value}`], {
        stdio: "ignore",
      });
    } catch {
      // Create new
      execFileSync(
        "op",
        [
          "item",
          "create",
          "--category",
          "password",
          "--title",
          itemName,
          `password=${value}`,
        ],
        { stdio: "ignore" },
      );
    }
  }

  async delete(service: string, account: string): Promise<void> {
    try {
      execFileSync("op", ["item", "delete", `${service}/${account}`], {
        stdio: "ignore",
      });
    } catch {
      // Not found
    }
  }

  async list(servicePrefix: string): Promise<string[]> {
    try {
      const result = execFileSync("op", ["item", "list", "--format", "json"], {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "ignore"],
      });
      const items = JSON.parse(result) as Array<{ title?: string }>;
      return items
        .filter((i) => i.title?.startsWith(servicePrefix))
        .map((i) => i.title!.slice(servicePrefix.length + 1));
    } catch {
      return [];
    }
  }
}
