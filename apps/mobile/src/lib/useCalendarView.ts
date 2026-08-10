import { useCallback, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';

export type CalendarView = 'cards' | 'list';

const STORAGE_KEY = 'kairos.calendarView.v1';
const DEFAULT_VIEW: CalendarView = 'cards';

/**
 * Persist the user's preferred Calendar view. New users always start on
 * "cards" — the hero visual experience. If they switch to "list" we
 * remember that choice for next launch.
 *
 * SecureStore is used purely because it's the storage primitive already
 * shipping in the app; the value is not sensitive.
 */
export function useCalendarView(): {
  view: CalendarView;
  setView: (v: CalendarView) => void;
  hydrated: boolean;
} {
  const [view, setViewState] = useState<CalendarView>(DEFAULT_VIEW);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await SecureStore.getItemAsync(STORAGE_KEY);
        if (!cancelled && (stored === 'cards' || stored === 'list')) {
          setViewState(stored);
        }
      } catch {
        // If SecureStore is unavailable we silently keep the default —
        // a wrong-view fallback is never worth breaking the screen.
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setView = useCallback((v: CalendarView) => {
    setViewState(v);
    // Fire-and-forget — the UI already reflects the change; a failed
    // write just means the preference won't survive a restart.
    void SecureStore.setItemAsync(STORAGE_KEY, v).catch(() => {});
  }, []);

  return { view, setView, hydrated };
}
