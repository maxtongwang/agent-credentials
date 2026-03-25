# Changelog

## 0.1.0 (unreleased)

- Initial release
- Core: CredentialStore with encrypted file backend
- 40 providers, 200+ env var aliases
- Type-aware alias resolution (api_key vs oauth_token)
- Multi-account with default selection
- Credential pair groups (AWS, Twilio)
- Auto-scan: env vars, AWS, GCloud, GitHub, .env files
- CLI: add, remove, list, inject, scan, check, init
- AES-256-GCM encryption with auto-generated key
- Shell injection: bash, zsh, fish
- Docker ENTRYPOINT compatible
