import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { prisma } from '@kairo/db';
import { loadEnv } from '../config/env.js';
import { expo } from './better-auth-expo.js';

const env = loadEnv();

const socialProviders: NonNullable<Parameters<typeof betterAuth>[0]>['socialProviders'] = {};

if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
  socialProviders.google = {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
  };
}

if (env.APPLE_CLIENT_ID && env.APPLE_CLIENT_SECRET) {
  socialProviders.apple = {
    clientId: env.APPLE_CLIENT_ID,
    clientSecret: env.APPLE_CLIENT_SECRET,
    ...(env.APPLE_APP_BUNDLE_IDENTIFIER
      ? { appBundleIdentifier: env.APPLE_APP_BUNDLE_IDENTIFIER }
      : {}),
  };
}

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  // Railway (and any reverse proxy) terminates TLS and forwards the client
  // via X-Real-IP / X-Forwarded-For. Fastify already has trustProxy: true;
  // Better Auth rate-limiting reads headers independently and needs this
  // or every request shares one bucket.
  advanced: {
    ipAddress: {
      ipAddressHeaders: ['x-real-ip', 'x-forwarded-for'],
      trustedProxies: ['10.0.0.0/8', '100.64.0.0/10'],
    },
  },
  emailAndPassword: {
    enabled: true,
  },
  user: {
    additionalFields: {
      timezone: {
        type: 'string',
        required: false,
        defaultValue: 'Asia/Kolkata',
        input: true,
      },
      onboardingDone: {
        type: 'boolean',
        required: false,
        defaultValue: false,
        input: false,
      },
    },
  },
  socialProviders,
  plugins: [expo()],
  trustedOrigins: [
    'kairo://',
    'kairo://*',
    env.APP_URL,
    env.API_URL,
    env.BETTER_AUTH_URL,
    'exp://',
    'exp://**',
    'http://localhost:8081',
    'http://127.0.0.1:8081',
    'http://192.168.*.*:*/**',
  ],
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          await prisma.notificationPreference.upsert({
            where: { userId: user.id },
            create: { userId: user.id },
            update: {},
          });
        },
      },
    },
  },
});

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  image?: string | null;
  timezone?: string;
  onboardingDone?: boolean;
};
