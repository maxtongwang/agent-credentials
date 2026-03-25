// Bitwarden keychain provider — uses `bw` CLI.

import { execFileSync } from "node:child_process";
import type { KeychainProvider } from "./interface.js";

export class BitwardenProvider implements KeychainProvider {
  name = "bitwarden";

  async detect(): Promise<boolean> {
    try {
      execFileSync("bw", ["--version"], { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  }

  async get(service: string, account: string): Promise<string | null> {
    try {
      const itemName = `${service}/${account}`;
      const result = execFileSync("bw", ["get", "password", itemName], {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "ignore"],
      });
      return result.trim() || null;
    } catch {
      return null;
    }
  }

  async set(service: string, account: string, value: string): Promise<void> {
    const itemName = `${service}/${account}`;
    // Bitwarden create requires JSON template
    const template = JSON.stringify({
      type: 2, // secure note type as fallback
      name: itemName,
      login: { username: account, password: value },
    });
    try {
      // Try edit first
      const existing = execFileSync("bw", ["get", "item", itemName], {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "ignore"],
      });
      const item = JSON.parse(existing) as { id: string };
      execFileSync("bw", ["edit", "item", item.id], {
        input: JSON.stringify({
          ...JSON.parse(existing),
          login: { username: account, password: value },
        }),
        stdio: ["pipe", "ignore", "ignore"],
      });
    } catch {
      // Create new
      try {
        execFileSync("bw", ["create", "item"], {
          input: Buffer.from(template).toString("base64"),
          stdio: ["pipe", "ignore", "ignore"],
        });
      } catch {
        // Best-effort
      }
    }
  }

  async delete(service: string, account: string): Promise<void> {
    try {
      const itemName = `${service}/${account}`;
      const result = execFileSync("bw", ["get", "item", itemName], {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "ignore"],
      });
      const item = JSON.parse(result) as { id: string };
      execFileSync("bw", ["delete", "item", item.id], { stdio: "ignore" });
    } catch {
      // Not found
    }
  }

  async list(servicePrefix: string): Promise<string[]> {
    try {
      const result = execFileSync(
        "bw",
        ["list", "items", "--search", servicePrefix],
        { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] },
      );
      const items = JSON.parse(result) as Array<{ name?: string }>;
      return items
        .filter((i) => i.name?.startsWith(servicePrefix))
        .map((i) => i.name!.slice(servicePrefix.length + 1));
    } catch {
      return [];
    }
  }
}
