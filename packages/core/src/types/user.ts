export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  timezone: string;
  onboardingDone: boolean;
}

export interface JwtPayload {
  sub: string; // user id
  email: string;
  iat?: number;
  exp?: number;
}
