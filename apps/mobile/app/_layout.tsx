import '../global.css';
import * as Sentry from '@sentry/react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { useFonts } from 'expo-font';
import Constants from 'expo-constants';
import {
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { QueryClientProvider } from '@tanstack/react-query';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { EventDetailProvider, ErrorBoundary } from '@/components';
import { queryClient } from '@/lib/query';
import { initAnalytics } from '@/lib/analytics';

// Foreground handler — without this, iOS/Android suppress the banner while
// the app is open and users only see the row in the in-app alerts tab
// (which reads from /api/notifications). We include both the modern
// (`shouldShowBanner`/`shouldShowList`, SDK 51+) and legacy
// (`shouldShowAlert`) keys so the same code works across expo-notifications
// versions.
const SENTRY_DSN = Constants.expoConfig?.extra?.sentryDsn as string | undefined;
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    tracesSampleRate: 0.2,
    environment: __DEV__ ? 'development' : 'production',
    enabled: !__DEV__,
  });
}

initAnalytics();

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function RootLayout() {
  // Obsidian Precision type pairing: Space Grotesk (headers/scores/telemetry)
  // + Inter (body). Hold the splash until fonts resolve so text never flashes.
  const [fontsLoaded, fontError] = useFonts({
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <BottomSheetModalProvider>
          {/* Must wrap the root Stack — /team/[id] is a sibling of (tabs),
              not a child of the tab navigator. Putting the provider only
              on (tabs) crashed the app when a home-page crest was tapped. */}
          <ErrorBoundary>
            <EventDetailProvider>
              <StatusBar style="light" />
              <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0A0E14' } }} />
            </EventDetailProvider>
          </ErrorBoundary>
        </BottomSheetModalProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

export default SENTRY_DSN ? Sentry.wrap(RootLayout) : RootLayout;
