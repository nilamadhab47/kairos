import { z } from 'zod';

// Mobile sends a Google ID token obtained via expo-auth-session.
// Server verifies it against Google\u2019s public keys and issues a Kairo JWT.
export const googleSignInSchema = z.object({
  idToken: z.string().min(10, 'idToken required'),
});

export type GoogleSignInInput = z.infer<typeof googleSignInSchema>;

export const authResponseSchema = z.object({
  token: z.string(),
  user: z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    name: z.string().nullable(),
    avatarUrl: z.string().url().nullable(),
    timezone: z.string(),
    onboardingDone: z.boolean(),
  }),
});

export type AuthResponse = z.infer<typeof authResponseSchema>;
