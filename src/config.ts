import "dotenv/config";

export type AdyenEnvironment = "TEST" | "LIVE";

export interface AppConfig {
  port: number;
  /** Absolute, trusted base URL of this app. Used to build shopper return URLs. */
  publicBaseUrl: string;
  apiKey: string;
  clientKey: string;
  merchantAccount: string;
  environment: AdyenEnvironment;
  liveUrlPrefix?: string;
  hmacKey?: string;
  webhookUsername?: string;
  webhookPassword?: string;
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. See .env.example.`,
    );
  }
  return value;
}

function optional(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

/**
 * Builds the application config from environment variables (12-factor).
 * Throws on startup if mandatory Adyen credentials are absent so the app
 * never boots into a half-configured state.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const environment = (
    optional(env, "ADYEN_ENVIRONMENT") ?? "TEST"
  ).toUpperCase();
  if (environment !== "TEST" && environment !== "LIVE") {
    throw new Error(
      `ADYEN_ENVIRONMENT must be "TEST" or "LIVE", received "${environment}".`,
    );
  }

  const liveUrlPrefix = optional(env, "ADYEN_LIVE_URL_PREFIX");
  if (environment === "LIVE" && !liveUrlPrefix) {
    throw new Error(
      "ADYEN_LIVE_URL_PREFIX is required when ADYEN_ENVIRONMENT=LIVE.",
    );
  }

  const port = Number.parseInt(optional(env, "PORT") ?? "8080", 10);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`PORT must be a valid TCP port, received "${env.PORT}".`);
  }

  const publicBaseUrl = (
    optional(env, "PUBLIC_BASE_URL") ?? `http://localhost:${port}`
  ).replace(/\/+$/, "");
  try {
    // Fail fast rather than sending shoppers to a malformed return URL.
    new URL(publicBaseUrl);
  } catch {
    throw new Error(
      `PUBLIC_BASE_URL must be an absolute URL, received "${publicBaseUrl}".`,
    );
  }

  return {
    port,
    publicBaseUrl,
    apiKey: required(env, "ADYEN_API_KEY"),
    clientKey: required(env, "ADYEN_CLIENT_KEY"),
    merchantAccount: required(env, "ADYEN_MERCHANT_ACCOUNT"),
    environment,
    liveUrlPrefix,
    hmacKey: optional(env, "ADYEN_HMAC_KEY"),
    webhookUsername: optional(env, "ADYEN_WEBHOOK_USERNAME"),
    webhookPassword: optional(env, "ADYEN_WEBHOOK_PASSWORD"),
  };
}
