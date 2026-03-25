# Contributing

## Setup

```bash
git clone https://github.com/maxtongwang/agent-credentials
cd agent-credentials
npm install
npm test
```

## PR Workflow

1. Fork → feature branch → PR to `main`
2. All tests must pass: `npm test && npm run typecheck`
3. CodeRabbit + Claude review on every PR
4. Squash merge after approval

## Adding a Provider

1. Add to `src/aliases.ts` in the `PROVIDERS` registry
2. Group by credential type (api_key, oauth_token, etc.)
3. List ALL known env var names for each type
4. Add a scanner in `src/scanners/` if the provider has config files
5. Add tests

## Code Style

- TypeScript strict mode
- No `any`
- Every file: 1-line comment at top
- Vitest for tests
