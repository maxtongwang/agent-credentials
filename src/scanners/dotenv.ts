// .env file scanner — reads .env files and discovers credentials via alias registry.

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { CredentialScanner, DiscoveredCredential } from "./interface.js";
import { lookupEnvVar } from "../aliases.js";

export class DotenvScanner implements CredentialScanner {
  name = "dotenv";

  private paths = [
    resolve(process.cwd(), ".env"),
    resolve(process.cwd(), ".env.local"),
  ];

  async detect(): Promise<boolean> {
    return this.paths.some((p) => existsSync(p));
  }

  async scan(): Promise<DiscoveredCredential[]> {
    const results: DiscoveredCredential[] = [];

    for (const path of this.paths) {
      if (!existsSync(path)) continue;

      const content = readFileSync(path, "utf8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;

        const eqIdx = trimmed.indexOf("=");
        if (eqIdx < 0) continue;

        const key = trimmed.slice(0, eqIdx).trim();
        let value = trimmed.slice(eqIdx + 1).trim();

        // Strip quotes
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }

        if (!value) continue;

        // Check if this env var matches a known provider
        const match = lookupEnvVar(key);
        if (!match) continue;

        results.push({
          provider: match.provider,
          credentialType: match.credentialType,
          account: "default",
          value,
          source: `dotenv:${path}:${key}`,
        });
      }
    }

    return results;
  }
}
