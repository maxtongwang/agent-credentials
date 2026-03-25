// agent-credentials — Universal credential injector for AI agents.

export { CredentialStore, type CredentialStoreOptions } from "./store.js";
export {
  resolveEnv,
  formatInject,
  formatDryRun,
  type OutputFormat,
} from "./resolver.js";
export { AesGcmEncryption } from "./encryption/aes-gcm.js";
export type { EncryptionProvider } from "./encryption/interface.js";
export { MemoryBackend } from "./backends/memory.js";
export type {
  CredentialBackend,
  StoredCredential,
  CredentialMetadata,
} from "./backends/interface.js";
export {
  PROVIDERS,
  getProvider,
  getAllProviders,
  lookupEnvVar,
  registerAliases,
  type ProviderDefinition,
  type CredentialTypeDefinition,
} from "./aliases.js";
export {
  registerCanonical,
  readFromCanonical,
  propagateToTools,
  hasCredential,
  getMap,
  registerToolPath,
  type CredentialMapping,
  type ToolConfigPath,
} from "./credential-map.js";
