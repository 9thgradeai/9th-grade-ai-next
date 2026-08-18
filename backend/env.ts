"server-only";

type Env = {
  AUTH_SECRET: string;
  DATABASE_URL: string;
  NODE_ENV: string;
  ANTHROPIC_API_KEY?: string;
};

const REQUIRED_ENV_VARS: (keyof Env)[] = [
  "AUTH_SECRET",
  "DATABASE_URL",
  "NODE_ENV",
];

function getRequiredEnv(name: keyof Env): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${String(name)}`);
  }
  return value;
}

function getOptionalEnv(name: string, defaultValue: string): string {
  return process.env[name] || defaultValue;
}

function validateEnv(): void {
  const missing = REQUIRED_ENV_VARS.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.map(String).join(", ")}`,
    );
  }
}

export const env: Env = {
  AUTH_SECRET: getRequiredEnv("AUTH_SECRET"),
  DATABASE_URL: getRequiredEnv("DATABASE_URL"),
  NODE_ENV: getRequiredEnv("NODE_ENV"),
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || "",
};

export { getRequiredEnv, getOptionalEnv, validateEnv };
