// Credential scanner interface — discovers credentials from various sources.

export interface DiscoveredCredential {
  provider: string;
  credentialType: string;
  account: string;
  value: string;
  source: string;
  expiresAt?: number;
  groupValues?: Record<string, string>;
}

export interface CredentialScanner {
  name: string;
  detect(): Promise<boolean>;
  scan(): Promise<DiscoveredCredential[]>;
}
