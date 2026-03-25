// Provider alias registry — type-aware mapping of providers to env var names.
// 40 providers, 200+ env vars. The core of credential resolution.

export interface CredentialTypeDefinition {
  /** All known env var names tools read for this credential type. */
  envVars: string[];
  /** Paired vars that must be injected together (e.g., AWS key + secret). */
  group?: string[];
  /** Whether this value is a secret (encrypt) vs config (plaintext ok). */
  isSecret: boolean;
}

export interface ProviderDefinition {
  /** Credential types this provider supports. */
  credentials: Record<string, CredentialTypeDefinition>;
  /** Non-secret config vars (project IDs, regions, etc.). */
  config?: Record<string, string[]>;
}

// ── Built-in registry (40 providers) ────────────────────────────────────────

export const PROVIDERS: Record<string, ProviderDefinition> = {
  google: {
    credentials: {
      api_key: { envVars: ["GOOGLE_API_KEY"], isSecret: true },
      oauth_token: {
        envVars: [
          "GOOGLE_ACCESS_TOKEN",
          "GOOGLE_OAUTH_TOKEN",
          "CLOUDSDK_AUTH_ACCESS_TOKEN",
        ],
        isSecret: true,
      },
      service_account: {
        envVars: ["GOOGLE_APPLICATION_CREDENTIALS"],
        isSecret: true,
      },
      refresh_token: { envVars: ["GOOGLE_REFRESH_TOKEN"], isSecret: true },
    },
    config: {
      project: [
        "GOOGLE_CLOUD_PROJECT",
        "GCLOUD_PROJECT",
        "CLOUDSDK_CORE_PROJECT",
      ],
      region: ["CLOUDSDK_COMPUTE_REGION", "GOOGLE_CLOUD_REGION"],
    },
  },
  github: {
    credentials: {
      personal_token: { envVars: ["GH_TOKEN", "GITHUB_TOKEN"], isSecret: true },
      enterprise_token: {
        envVars: ["GH_ENTERPRISE_TOKEN", "GITHUB_ENTERPRISE_TOKEN"],
        isSecret: true,
      },
    },
  },
  openai: {
    credentials: {
      api_key: { envVars: ["OPENAI_API_KEY"], isSecret: true },
    },
    config: {
      org: ["OPENAI_ORG_ID"],
      project: ["OPENAI_PROJECT_ID"],
      base_url: ["OPENAI_BASE_URL"],
    },
  },
  anthropic: {
    credentials: {
      api_key: { envVars: ["ANTHROPIC_API_KEY"], isSecret: true },
      auth_token: { envVars: ["ANTHROPIC_AUTH_TOKEN"], isSecret: true },
    },
  },
  slack: {
    credentials: {
      bot_token: {
        envVars: ["SLACK_BOT_TOKEN", "SLACK_API_TOKEN"],
        isSecret: true,
      },
      app_token: { envVars: ["SLACK_APP_TOKEN"], isSecret: true },
      signing_secret: { envVars: ["SLACK_SIGNING_SECRET"], isSecret: true },
    },
  },
  twitter: {
    credentials: {
      bearer_token: {
        envVars: ["TWITTER_BEARER_TOKEN", "X_BEARER_TOKEN"],
        isSecret: true,
      },
      api_key: {
        envVars: ["TWITTER_API_KEY", "X_API_KEY"],
        group: ["TWITTER_API_KEY", "TWITTER_API_SECRET"],
        isSecret: true,
      },
      access_token: {
        envVars: ["TWITTER_ACCESS_TOKEN", "X_ACCESS_TOKEN"],
        group: ["TWITTER_ACCESS_TOKEN", "TWITTER_ACCESS_TOKEN_SECRET"],
        isSecret: true,
      },
    },
  },
  notion: {
    credentials: {
      api_key: {
        envVars: ["NOTION_TOKEN", "NOTION_KEY", "NOTION_API_KEY"],
        isSecret: true,
      },
    },
  },
  stripe: {
    credentials: {
      secret_key: {
        envVars: ["STRIPE_API_KEY", "STRIPE_SECRET_KEY"],
        isSecret: true,
      },
      webhook_secret: { envVars: ["STRIPE_WEBHOOK_SECRET"], isSecret: true },
    },
  },
  aws: {
    credentials: {
      access_key: {
        envVars: ["AWS_ACCESS_KEY_ID"],
        group: ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"],
        isSecret: true,
      },
      session_token: {
        envVars: ["AWS_SESSION_TOKEN", "AWS_SECURITY_TOKEN"],
        isSecret: true,
      },
    },
    config: {
      region: ["AWS_REGION", "AWS_DEFAULT_REGION"],
      profile: ["AWS_PROFILE"],
    },
  },
  azure: {
    credentials: {
      client_secret: {
        envVars: ["AZURE_CLIENT_SECRET"],
        group: ["AZURE_TENANT_ID", "AZURE_CLIENT_ID", "AZURE_CLIENT_SECRET"],
        isSecret: true,
      },
    },
    config: {
      subscription: ["AZURE_SUBSCRIPTION_ID"],
    },
  },
  discord: {
    credentials: {
      bot_token: {
        envVars: ["DISCORD_TOKEN", "DISCORD_BOT_TOKEN"],
        isSecret: true,
      },
    },
    config: {
      client_id: ["DISCORD_CLIENT_ID"],
    },
  },
  telegram: {
    credentials: {
      bot_token: {
        envVars: ["TELEGRAM_BOT_TOKEN", "BOT_TOKEN"],
        isSecret: true,
      },
    },
  },
  sendgrid: {
    credentials: {
      api_key: { envVars: ["SENDGRID_API_KEY"], isSecret: true },
    },
  },
  twilio: {
    credentials: {
      auth_token: {
        envVars: ["TWILIO_AUTH_TOKEN"],
        group: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"],
        isSecret: true,
      },
      api_key: {
        envVars: ["TWILIO_API_KEY"],
        group: ["TWILIO_API_KEY", "TWILIO_API_SECRET"],
        isSecret: true,
      },
    },
  },
  cloudflare: {
    credentials: {
      api_token: {
        envVars: ["CLOUDFLARE_API_TOKEN", "CF_API_TOKEN"],
        isSecret: true,
      },
      api_key: {
        envVars: ["CLOUDFLARE_API_KEY", "CF_API_KEY"],
        isSecret: true,
      },
    },
    config: {
      account_id: ["CLOUDFLARE_ACCOUNT_ID"],
    },
  },
  vercel: {
    credentials: {
      token: { envVars: ["VERCEL_TOKEN"], isSecret: true },
    },
  },
  supabase: {
    credentials: {
      service_key: {
        envVars: ["SUPABASE_SERVICE_ROLE_KEY"],
        isSecret: true,
      },
      anon_key: { envVars: ["SUPABASE_ANON_KEY"], isSecret: true },
    },
    config: {
      url: ["SUPABASE_URL"],
    },
  },
  firebase: {
    credentials: {
      service_account: {
        envVars: ["GOOGLE_APPLICATION_CREDENTIALS"],
        isSecret: true,
      },
      token: { envVars: ["FIREBASE_TOKEN"], isSecret: true },
    },
  },
  pinecone: {
    credentials: {
      api_key: { envVars: ["PINECONE_API_KEY"], isSecret: true },
    },
  },
  redis: {
    credentials: {
      url: { envVars: ["REDIS_URL"], isSecret: true },
      password: { envVars: ["REDIS_PASSWORD"], isSecret: true },
    },
    config: {
      host: ["REDIS_HOST"],
      port: ["REDIS_PORT"],
    },
  },
  postgresql: {
    credentials: {
      password: { envVars: ["PGPASSWORD"], isSecret: true },
      url: { envVars: ["DATABASE_URL"], isSecret: true },
    },
    config: {
      host: ["PGHOST"],
      port: ["PGPORT"],
      database: ["PGDATABASE"],
      user: ["PGUSER"],
    },
  },
  mongodb: {
    credentials: {
      uri: {
        envVars: ["MONGODB_URI", "MONGO_URI", "MONGO_URL"],
        isSecret: true,
      },
    },
  },
  docker: {
    credentials: {
      config: { envVars: ["DOCKER_CONFIG"], isSecret: false },
    },
    config: {
      host: ["DOCKER_HOST"],
      context: ["DOCKER_CONTEXT"],
    },
  },
  kubernetes: {
    credentials: {
      config: { envVars: ["KUBECONFIG"], isSecret: false },
    },
  },
  linear: {
    credentials: {
      api_key: { envVars: ["LINEAR_API_KEY"], isSecret: true },
    },
  },
  jira: {
    credentials: {
      api_token: { envVars: ["JIRA_API_TOKEN"], isSecret: true },
    },
    config: {
      email: ["JIRA_EMAIL"],
      domain: ["JIRA_DOMAIN"],
    },
  },
  huggingface: {
    credentials: {
      token: {
        envVars: ["HF_TOKEN", "HUGGING_FACE_HUB_TOKEN"],
        isSecret: true,
      },
    },
  },
  replicate: {
    credentials: {
      api_token: { envVars: ["REPLICATE_API_TOKEN"], isSecret: true },
    },
  },
  elevenlabs: {
    credentials: {
      api_key: {
        envVars: ["ELEVENLABS_API_KEY", "ELEVEN_API_KEY"],
        isSecret: true,
      },
    },
  },
  brave: {
    credentials: {
      api_key: {
        envVars: ["BRAVE_SEARCH_API_KEY", "BRAVE_API_KEY"],
        isSecret: true,
      },
    },
  },
  exa: {
    credentials: {
      api_key: { envVars: ["EXA_API_KEY"], isSecret: true },
    },
  },
  perplexity: {
    credentials: {
      api_key: {
        envVars: ["PERPLEXITY_API_KEY", "PPLX_API_KEY"],
        isSecret: true,
      },
    },
  },
  groq: {
    credentials: {
      api_key: { envVars: ["GROQ_API_KEY"], isSecret: true },
    },
  },
  mistral: {
    credentials: {
      api_key: { envVars: ["MISTRAL_API_KEY"], isSecret: true },
    },
  },
  cohere: {
    credentials: {
      api_key: {
        envVars: ["CO_API_KEY", "COHERE_API_KEY"],
        isSecret: true,
      },
    },
  },
  together: {
    credentials: {
      api_key: { envVars: ["TOGETHER_API_KEY"], isSecret: true },
    },
  },
  deepseek: {
    credentials: {
      api_key: { envVars: ["DEEPSEEK_API_KEY"], isSecret: true },
    },
  },
  docusign: {
    credentials: {
      integration_key: {
        envVars: ["DOCUSIGN_INTEGRATION_KEY"],
        isSecret: true,
      },
      secret_key: { envVars: ["DOCUSIGN_SECRET_KEY"], isSecret: true },
    },
    config: {
      account_id: ["DOCUSIGN_ACCOUNT_ID"],
    },
  },
  calendly: {
    credentials: {
      api_token: { envVars: ["CALENDLY_API_TOKEN"], isSecret: true },
    },
  },
  zoom: {
    credentials: {
      client_credentials: {
        envVars: ["ZOOM_CLIENT_SECRET"],
        group: ["ZOOM_ACCOUNT_ID", "ZOOM_CLIENT_ID", "ZOOM_CLIENT_SECRET"],
        isSecret: true,
      },
    },
  },
};

// ── Custom aliases (user-registered) ────────────────────────────────────────

const customAliases = new Map<string, ProviderDefinition>();

/** Register custom provider aliases. Merges with built-in. */
export function registerAliases(
  provider: string,
  definition: ProviderDefinition,
): void {
  customAliases.set(provider, definition);
}

/** Get provider definition (built-in + custom). */
export function getProvider(provider: string): ProviderDefinition | undefined {
  return customAliases.get(provider) ?? PROVIDERS[provider];
}

/** Get all provider names. */
export function getAllProviders(): string[] {
  const builtIn = Object.keys(PROVIDERS);
  const custom = [...customAliases.keys()];
  return [...new Set([...builtIn, ...custom])];
}

/**
 * Reverse lookup: given an env var name, find which provider + credential type it belongs to.
 * Used by the env var scanner to map discovered env vars to providers.
 */
export function lookupEnvVar(
  envVar: string,
): { provider: string; credentialType: string } | null {
  for (const [provider, def] of [
    ...Object.entries(PROVIDERS),
    ...customAliases.entries(),
  ]) {
    for (const [credType, credDef] of Object.entries(def.credentials)) {
      if (credDef.envVars.includes(envVar)) {
        return { provider, credentialType: credType };
      }
      if (credDef.group?.includes(envVar)) {
        return { provider, credentialType: credType };
      }
    }
  }
  return null;
}
