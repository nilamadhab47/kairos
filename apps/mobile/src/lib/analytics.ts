import PostHog from 'posthog-react-native';
import Constants from 'expo-constants';

const POSTHOG_KEY = Constants.expoConfig?.extra?.posthogApiKey as string | undefined;
const POSTHOG_HOST = (Constants.expoConfig?.extra?.posthogHost as string | undefined) ?? 'https://us.i.posthog.com';

let posthog: PostHog | null = null;

export function initAnalytics(): PostHog | null {
  if (!POSTHOG_KEY || __DEV__) return null;
  posthog = new PostHog(POSTHOG_KEY, { host: POSTHOG_HOST });
  return posthog;
}

export function getPostHog(): PostHog | null {
  return posthog;
}

export function identify(userId: string, properties?: Record<string, string | number | boolean>): void {
  posthog?.identify(userId, properties);
}

export function track(event: string, properties?: Record<string, string | number | boolean>): void {
  posthog?.capture(event, properties);
}

export function screen(name: string, properties?: Record<string, string | number | boolean>): void {
  posthog?.screen(name, properties);
}

export function reset(): void {
  posthog?.reset();
}
