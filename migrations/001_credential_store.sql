-- credential_store — encrypted credential storage for agent-credentials SupabaseBackend.
-- Secrets stored in encrypted_data (AES-256-GCM, decrypted in Node process only).
-- Workspace isolation is enforced at the application layer (all queries filter by workspace_id).
-- RLS is not used because the backend connects with the service role key which bypasses RLS.

CREATE TABLE credential_store (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id    text NOT NULL,
  provider        text NOT NULL,
  account         text NOT NULL DEFAULT 'default',
  credential_type text NOT NULL DEFAULT 'api_key',
  encrypted_data  text NOT NULL,
  scopes          text[],
  expires_at      timestamptz,
  is_default      boolean DEFAULT false,
  source          text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  UNIQUE(workspace_id, provider, account)
);

CREATE INDEX idx_cred_workspace ON credential_store(workspace_id);
