import { createAuthClient } from 'better-auth/react';
import { expoClient } from '@better-auth/expo/client';
import * as SecureStore from 'expo-secure-store';
import { API_URL } from './env';

export const authClient = createAuthClient({
  baseURL: API_URL,
  plugins: [
    // Expo plugin types can lag Better Auth core in monorepo installs
    expoClient({
      scheme: 'kairo',
      storagePrefix: 'kairo',
      storage: SecureStore,
    }) as never,
  ],
});

export function getAuthCookie(): string {
  const client = authClient as unknown as { getCookie?: () => string };
  return client.getCookie?.() ?? '';
}

export const { useSession, signIn, signUp, signOut } = authClient;
