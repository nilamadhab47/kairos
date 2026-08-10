import { useEffect, useRef } from 'react';
import { useSession } from '@/lib/auth-client';
import { registerPushDevice } from '@/lib/push';

/**
 * Best-effort refresh of Expo push token when a signed-in, onboarded session is active.
 * Does not prompt if permission was previously denied.
 */
export function PushRegistrar() {
  const { data: session } = useSession();
  const attempted = useRef<string | null>(null);

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) return;
    const onboardingDone = (session.user as { onboardingDone?: boolean }).onboardingDone;
    if (!onboardingDone) return;
    if (attempted.current === userId) return;
    attempted.current = userId;
    void registerPushDevice({ requestPermission: false });
  }, [session?.user]);

  return null;
}
