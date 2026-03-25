<div align="center">

# agent-credentials

**Universal credential injector for AI agents. Install it. Everything just works.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![npm](https://img.shields.io/npm/v/agent-credentials)](https://www.npmjs.com/package/agent-credentials)
[![Node 20+](https://img.shields.io/badge/node-20+-brightgreen)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)](https://www.typescriptlang.org)
[![Tests](https://github.com/maxtongwang/agent-credentials/actions/workflows/ci.yml/badge.svg)](https://github.com/maxtongwang/agent-credentials/actions)

<a href="https://www.buymeacoffee.com/whatupmax">
  <img src="https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black" alt="Buy Me A Coffee" />
</a>

---

> One install. Zero config. Every CLI tool gets credentials automatically.

</div>

---

## The Problem

You have 5 Google accounts, 3 GitHub tokens, and 20 CLI tools — each reading credentials from different env var names. Every new tool needs manual setup. Multi-account is a mess.

## The Solution

```bash
npm install -g agent-credentials
```

That's it. agent-credentials:

1. **Scans** your machine for existing credentials (AWS, GCloud, GitHub, .env files, keychains)
2. **Stores** them encrypted in a unified store
3. **Injects** them into every shell — expanding to ALL known env var names each tool expects

Every CLI tool just works. No manual env var setup. No per-tool configuration.

---

## Quick Start

```bash
npm install -g agent-credentials
```

That's it. Install auto-scans your machine, hooks your shell, and stores everything encrypted. Open a new terminal — every CLI tool just works.

### Docker

```dockerfile
RUN npm install -g agent-credentials
ENTRYPOINT ["sh", "-c", "eval $(agent-credentials inject) && exec \"$@\"", "--"]
```

### Manual inject (no shell hook)

```bash
eval "$(agent-credentials inject)"       # bash/zsh
agent-credentials inject --json          # programmatic
```

---

## What it does

```
┌──────────────────────────────────────────────────┐
│                agent-credentials                  │
│                                                   │
│  Scan       → discover creds from env, files,     │
│               keychains, .env, AWS/GCloud config   │
│                                                   │
│  Store      → encrypted, multi-account,            │
│               provider-aware                       │
│                                                   │
│  Resolve    → pick default account, check expiry,  │
│               expand aliases                       │
│                                                   │
│  Inject     → eval "$(agent-credentials inject)"   │
│               sets ALL env vars for ALL tools       │
└──────────────────────────────────────────────────┘
```

---

## Multi-Account

Connect multiple accounts per provider. Default account is used automatically.

```bash
# Add accounts
agent-credentials add google --account work@company.com --token ya29...
agent-credentials add google --account personal@gmail.com --token ya29...

# Set default
agent-credentials set-default google work@company.com

# List
agent-credentials accounts google
# → * work@company.com (default)
#   personal@gmail.com

# Injected env vars:
# GOOGLE_ACCESS_TOKEN=<work token>           ← default
# GOOGLE_OAUTH_TOKEN=<work token>            ← alias
# CLOUDSDK_AUTH_ACCESS_TOKEN=<work token>    ← alias
# CREDENTIAL_ACCOUNTS_google=work@company.com,personal@gmail.com
```

---

## Auto-Scan Sources

agent-credentials automatically discovers credentials from:

| Source                   | What it finds                                          |
| ------------------------ | ------------------------------------------------------ |
| Environment variables    | Any existing API keys (GOOGLE_API_KEY, GH_TOKEN, etc.) |
| `~/.aws/credentials`     | AWS access keys and profiles                           |
| `~/.config/gcloud/`      | Google OAuth tokens                                    |
| `~/.config/gh/hosts.yml` | GitHub tokens                                          |
| `~/.docker/config.json`  | Docker registry auth                                   |
| `.env` files             | Project-level secrets                                  |
| macOS Keychain           | Stored service passwords                               |
| `~/.kube/config`         | Kubernetes tokens                                      |

---

## 40+ Providers, 200+ Env Vars

Built-in alias registry covers all major tools:

| Provider  | Env vars auto-mapped                                                                |
| --------- | ----------------------------------------------------------------------------------- |
| Google    | GOOGLE_API_KEY, GOOGLE_ACCESS_TOKEN, GOOGLE_OAUTH_TOKEN, CLOUDSDK_AUTH_ACCESS_TOKEN |
| GitHub    | GH_TOKEN, GITHUB_TOKEN                                                              |
| AWS       | AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY (always paired)                           |
| OpenAI    | OPENAI_API_KEY                                                                      |
| Anthropic | ANTHROPIC_API_KEY                                                                   |
| Stripe    | STRIPE_API_KEY, STRIPE_SECRET_KEY                                                   |
| Slack     | SLACK_BOT_TOKEN, SLACK_API_TOKEN                                                    |
| + 33 more | [Full registry →](docs/PROVIDERS.md)                                                |

Same credential → injected under ALL known env var names. Any CLI tool reads its expected var.

---

## CLI Reference

```bash
agent-credentials init               # Auto-hook shell + first scan
agent-credentials inject             # Output env var exports (for eval)
agent-credentials inject --json      # Output as JSON
agent-credentials inject --dry-run   # Show what would be injected (masked)
agent-credentials scan               # Re-scan all sources
agent-credentials add <provider>     # Add a credential manually
agent-credentials remove <provider>  # Remove a credential
agent-credentials list               # List all stored credentials
agent-credentials accounts <provider> # List accounts for a provider
agent-credentials set-default <provider> <account>  # Set default account
agent-credentials check              # Health check all credentials
agent-credentials rotate-key         # Re-encrypt with new key
agent-credentials version            # Print version
agent-credentials uninstall          # Remove store, key, shell hooks
```

---

## For AI Agent Frameworks

agent-credentials is framework-agnostic. Works with any agent that spawns processes:

| Framework     | Integration                                                |
| ------------- | ---------------------------------------------------------- |
| Claude Code   | Shell profile — zero code                                  |
| OpenClaw      | Shell exec env — zero code                                 |
| LangChain     | `subprocess.Popen(env=json.loads(output))`                 |
| CrewAI        | Same as LangChain                                          |
| AutoGen       | Same as LangChain                                          |
| Any framework | `eval "$(agent-credentials inject)"` before tool execution |

---

## Security

| Feature         | Detail                                                                    |
| --------------- | ------------------------------------------------------------------------- |
| Encryption      | AES-256-GCM at rest. Auto-generated key on first run.                     |
| Permissions     | Store dir: 0700. Key file: 0600.                                          |
| No plaintext    | Credentials never stored unencrypted.                                     |
| Scan only reads | Scanners only read existing files. Never modify.                          |
| No network      | Core package makes zero network requests. Scanners read local files only. |
| Open source     | Full source available. No telemetry. No phone-home.                       |

---

## Development

```bash
git clone https://github.com/maxtongwang/agent-credentials
cd agent-credentials
npm install
npm test          # run all tests
npm run typecheck # TypeScript strict
```

---

<div align="center">

<a href="https://www.buymeacoffee.com/whatupmax">
  <img src="https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png" alt="Buy Me A Coffee" />
</a>

MIT License

</div>
