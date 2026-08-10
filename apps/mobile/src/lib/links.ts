import Constants from 'expo-constants';

/**
 * External web links surfaced from Settings > About.
 *
 * Read from `expo.extra.links` in app.json / EAS config so ops can point
 * them at real content later without a code change. Returning `null` from
 * any getter makes the settings screen simply omit that row — we never
 * ship a broken "Privacy Policy" tap that leads nowhere.
 */

type LinksExtra = {
  privacyUrl?: string;
  termsUrl?: string;
  aboutUrl?: string;
};

function extra(): LinksExtra {
  const e = Constants.expoConfig?.extra as { links?: LinksExtra } | undefined;
  return e?.links ?? {};
}

function orNull(v: string | undefined): string | null {
  return v && v.trim().length > 0 ? v : null;
}

export const links = {
  privacy: (): string | null => orNull(extra().privacyUrl),
  terms: (): string | null => orNull(extra().termsUrl),
  about: (): string | null => orNull(extra().aboutUrl),
};
