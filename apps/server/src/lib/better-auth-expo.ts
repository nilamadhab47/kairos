/**
 * Server-side Better Auth Expo plugin (vendored).
 * Avoids depending on `@better-auth/expo` in the API package so pnpm doesn't
 * pull Expo / React Native / Next into `apps/server` (breaks Android EAS builds).
 *
 * Source aligned with `@better-auth/expo` 1.6.x server plugin.
 */
import { createAuthMiddleware } from '@better-auth/core/api';
import { HIDE_METADATA } from 'better-auth';
import { APIError, createAuthEndpoint } from 'better-auth/api';
import { z } from 'zod';

type ExpoPluginOptions = {
  disableOriginOverride?: boolean;
};

const expoAuthorizationProxy = createAuthEndpoint(
  '/expo-authorization-proxy',
  {
    method: 'GET',
    query: z.object({
      authorizationURL: z.string(),
      oauthState: z.string().optional(),
    }),
    metadata: HIDE_METADATA,
  },
  async (ctx) => {
    const { authorizationURL } = ctx.query;
    if (authorizationURL.includes('#')) {
      throw new APIError('BAD_REQUEST', { message: 'Invalid authorizationURL' });
    }
    let url: URL;
    try {
      url = new URL(authorizationURL);
    } catch {
      throw new APIError('BAD_REQUEST', { message: 'Invalid authorizationURL' });
    }
    if (url.protocol !== 'https:' || url.origin === new URL(ctx.context.baseURL).origin) {
      throw new APIError('BAD_REQUEST', { message: 'Invalid authorizationURL' });
    }
    const { oauthState } = ctx.query;
    if (oauthState) {
      const oauthStateCookie = ctx.context.createAuthCookie('oauth_state', { maxAge: 600 });
      ctx.setCookie(oauthStateCookie.name, oauthState, oauthStateCookie.attributes);
      return ctx.redirect(authorizationURL);
    }
    const state = url.searchParams.get('state');
    if (!state) throw new APIError('BAD_REQUEST', { message: 'Unexpected error' });
    const stateCookie = ctx.context.createAuthCookie('state', { maxAge: 300 });
    await ctx.setSignedCookie(stateCookie.name, state, ctx.context.secret, stateCookie.attributes);
    return ctx.redirect(ctx.query.authorizationURL);
  },
);

export function expo(options?: ExpoPluginOptions) {
  return {
    id: 'expo',
    version: 'vendored',
    init: () => ({
      options: {
        trustedOrigins: process.env.NODE_ENV === 'development' ? ['exp://'] : [],
      },
    }),
    async onRequest(request: Request) {
      if (options?.disableOriginOverride || request.headers.get('origin')) return;
      const expoOrigin = request.headers.get('expo-origin');
      if (!expoOrigin) return;
      try {
        request.headers.set('origin', expoOrigin);
        return { request };
      } catch {
        const newHeaders = new Headers(request.headers);
        newHeaders.set('origin', expoOrigin);
        return { request: new Request(request, { headers: newHeaders }) };
      }
    },
    hooks: {
      after: [
        {
          matcher(context: { path?: string }) {
            return !!(
              context.path?.startsWith('/callback') ||
              context.path?.startsWith('/oauth2/callback') ||
              context.path?.startsWith('/magic-link/verify') ||
              context.path?.startsWith('/verify-email')
            );
          },
          handler: createAuthMiddleware(async (ctx) => {
            const headers = ctx.context.responseHeaders;
            const location = headers?.get('location');
            if (!location) return;
            if (location.includes('/oauth-proxy-callback')) return;
            let redirectURL: URL;
            try {
              redirectURL = new URL(location);
            } catch {
              return;
            }
            if (redirectURL.protocol === 'http:' || redirectURL.protocol === 'https:') return;
            if (!ctx.context.isTrustedOrigin(location)) return;
            const cookie = headers?.get('set-cookie');
            if (!cookie) return;
            redirectURL.searchParams.set('cookie', cookie);
            ctx.setHeader('location', redirectURL.toString());
          }),
        },
      ],
    },
    endpoints: { expoAuthorizationProxy },
    options,
  };
}
