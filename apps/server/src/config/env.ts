import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  SERVER_PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().default('0.0.0.0'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL required'),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 chars'),
  JWT_EXPIRES_IN: z.string().default('30d'),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_IOS_CLIENT_ID: z.string().optional(),
  GOOGLE_ANDROID_CLIENT_ID: z.string().optional(),
  GOOGLE_WEB_CLIENT_ID: z.string().optional(),

  APP_URL: z.string().url().default('http://localhost:3000'),
  API_URL: z.string().url().default('http://localhost:4000'),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

export function loadEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error('[env] invalid configuration:', parsed.error.flatten().fieldErrors);
    throw new Error('Invalid environment configuration');
  }
  cached = parsed.data;
  return cached;
}

/**
 * All Google OAuth client IDs accepted when verifying ID tokens.
 * Mobile platforms (iOS/Android) use platform-specific clients in Google Cloud;
 * each issued id_token has the matching client as its audience.
 */
export function googleAudiences(env: Env): string[] {
  return [
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_WEB_CLIENT_ID,
    env.GOOGLE_IOS_CLIENT_ID,
    env.GOOGLE_ANDROID_CLIENT_ID,
  ].filter((v): v is string => typeof v === 'string' && v.length > 0);
}
