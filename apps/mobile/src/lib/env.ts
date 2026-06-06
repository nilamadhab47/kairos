import Constants from 'expo-constants';

function read(key: string, fallback?: string): string {
  // EXPO_PUBLIC_* vars are inlined at build time, but also exposed via Constants.expoConfig.extra.
  const fromEnv = (process.env as Record<string, string | undefined>)[key];
  const fromExtra = (Constants.expoConfig?.extra as Record<string, string | undefined> | undefined)?.[
    key
  ];
  const value = fromEnv ?? fromExtra ?? fallback;
  if (!value) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return value;
}

export const env = {
  apiUrl: read('EXPO_PUBLIC_API_URL', 'http://localhost:4000'),
  googleIosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '',
  googleAndroidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ?? '',
  googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '',
};
