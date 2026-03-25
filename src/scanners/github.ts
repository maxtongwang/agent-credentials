// GitHub CLI scanner — reads ~/.config/gh/hosts.yml for GitHub tokens.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { CredentialScanner, DiscoveredCredential } from "./interface.js";

const HOSTS_FILE = join(homedir(), ".config", "gh", "hosts.yml");

export class GitHubScanner implements CredentialScanner {
  name = "github";

  async detect(): Promise<boolean> {
    return existsSync(HOSTS_FILE);
  }

  async scan(): Promise<DiscoveredCredential[]> {
    if (!existsSync(HOSTS_FILE)) return [];

    const content = readFileSync(HOSTS_FILE, "utf8");
    const results: DiscoveredCredential[] = [];

    // Simple YAML parsing for gh hosts format:
    // github.com:
    //   oauth_token: ghp_...
    //   user: username
    let currentHost: string | null = null;
    for (const line of content.split("\n")) {
      const hostMatch = line.match(/^(\S+):\s*$/);
      if (hostMatch) {
        currentHost = hostMatch[1] ?? null;
        continue;
      }

      if (!currentHost) continue;

      const tokenMatch = line.match(/^\s+oauth_token:\s*(.+)/);
      if (tokenMatch?.[1]) {
        const isEnterprise = currentHost !== "github.com";
        results.push({
          provider: "github",
          credentialType: isEnterprise ? "enterprise_token" : "personal_token",
          account: currentHost,
          value: tokenMatch[1].trim(),
          source: `file:${HOSTS_FILE}:${currentHost}`,
        });
      }
    }

    return results;
  }
}
