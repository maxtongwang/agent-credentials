// AWS credentials scanner — reads ~/.aws/credentials for access key pairs.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { CredentialScanner, DiscoveredCredential } from "./interface.js";

const AWS_CREDS_FILE = join(homedir(), ".aws", "credentials");

export class AwsScanner implements CredentialScanner {
  name = "aws";

  async detect(): Promise<boolean> {
    return existsSync(AWS_CREDS_FILE);
  }

  async scan(): Promise<DiscoveredCredential[]> {
    if (!existsSync(AWS_CREDS_FILE)) return [];

    const content = readFileSync(AWS_CREDS_FILE, "utf8");
    const results: DiscoveredCredential[] = [];

    let currentProfile: string | null = null;
    let accessKey: string | null = null;
    let secretKey: string | null = null;
    let sessionToken: string | null = null;

    const flushProfile = () => {
      if (currentProfile && accessKey && secretKey) {
        results.push({
          provider: "aws",
          credentialType: "access_key",
          account: currentProfile,
          value: accessKey,
          source: `file:${AWS_CREDS_FILE}:${currentProfile}`,
          groupValues: {
            AWS_ACCESS_KEY_ID: accessKey,
            AWS_SECRET_ACCESS_KEY: secretKey,
          },
        });
        if (sessionToken) {
          results.push({
            provider: "aws",
            credentialType: "session_token",
            account: currentProfile,
            value: sessionToken,
            source: `file:${AWS_CREDS_FILE}:${currentProfile}`,
          });
        }
      }
      accessKey = null;
      secretKey = null;
      sessionToken = null;
    };

    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const profileMatch = trimmed.match(/^\[(.+)\]$/);
      if (profileMatch) {
        flushProfile();
        currentProfile = profileMatch[1] ?? null;
        continue;
      }

      const kvMatch = trimmed.match(/^(\w+)\s*=\s*(.+)$/);
      if (!kvMatch) continue;

      const [, key, val] = kvMatch;
      if (key === "aws_access_key_id") accessKey = val!.trim();
      else if (key === "aws_secret_access_key") secretKey = val!.trim();
      else if (key === "aws_session_token") sessionToken = val!.trim();
    }

    flushProfile(); // Don't forget last profile
    return results;
  }
}
