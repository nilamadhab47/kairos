import { useEffect, useMemo } from 'react';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { api, setToken } from './api';
import { env } from './env';

WebBrowser.maybeCompleteAuthSession();

export interface SignInUser {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  timezone: string;
  onboardingDone: boolean;
}

export interface AuthResponseBody {
  token: string;
  user: SignInUser;
}

/**
 * Hook that wires up Google OAuth via expo-auth-session and exchanges the
 * Google id_token for a Kairo JWT. The JWT is persisted to SecureStore.
 *
 * Usage:
 *   const { promptAsync, exchanging, user, error } = useGoogleSignIn();
 *   <Button onPress={() => promptAsync()} />
 */
export function useGoogleSignIn(onSuccess?: (user: SignInUser) => void) {
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    iosClientId: env.googleIosClientId || undefined,
    androidClientId: env.googleAndroidClientId || undefined,
    webClientId: env.googleWebClientId || undefined,
  });

  useEffect(() => {
    if (response?.type !== 'success') return;
    const idToken = response.params.id_token;
    if (!idToken) return;

    void (async () => {
      try {
        const result = await api<AuthResponseBody>('/auth/google', {
          method: 'POST',
          body: { idToken },
          auth: false,
        });
        await setToken(result.token);
        onSuccess?.(result.user);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[auth] sign-in exchange failed:', err);
      }
    })();
  }, [response, onSuccess]);

  return useMemo(
    () => ({
      ready: !!request,
      promptAsync,
      response,
    }),
    [request, promptAsync, response],
  );
}
