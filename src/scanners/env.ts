// Env var scanner — discovers credentials from process.env by matching against alias registry.

import type { CredentialScanner, DiscoveredCredential } from "./interface.js";
import { PROVIDERS } from "../aliases.js";

export class EnvScanner implements CredentialScanner {
  name = "env";

  async detect(): Promise<boolean> {
    return true; // Always available
  }

  async scan(): Promise<DiscoveredCredential[]> {
    const results: DiscoveredCredential[] = [];
    const seen = new Set<string>(); // Avoid duplicating same provider+type

    for (const [provider, def] of Object.entries(PROVIDERS)) {
      for (const [credType, credDef] of Object.entries(def.credentials)) {
        // Check primary env var (first in list)
        for (const envVar of credDef.envVars) {
          const val = process.env[envVar];
          if (!val) continue;

          const key = `${provider}:${credType}`;
          if (seen.has(key)) break; // Already found this provider+type
          seen.add(key);

          // For groups, collect all group values
          let groupValues: Record<string, string> | undefined;
          if (credDef.group) {
            groupValues = {};
            for (const gVar of credDef.group) {
              const gVal = process.env[gVar];
              if (gVal) groupValues[gVar] = gVal;
            }
            // Only include group if all required vars present
            if (Object.keys(groupValues).length !== credDef.group.length) {
              groupValues = undefined;
            }
          }

          results.push({
            provider,
            credentialType: credType,
            account: "default",
            value: val,
            source: `env:${envVar}`,
            groupValues,
          });
          break; // Found for this type, move to next
        }
      }
    }

    return results;
  }
}
