import '../global.css';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { QueryClientProvider } from '@tanstack/react-query';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { EventDetailProvider, ErrorBoundary } from '@/components';
import { queryClient } from '@/lib/query';

// Foreground handler — without this, iOS/Android suppress the banner while
// the app is open and users only see the row in the in-app alerts tab
// (which reads from /api/notifications). We include both the modern
// (`shouldShowBanner`/`shouldShowList`, SDK 51+) and legacy
// (`shouldShowAlert`) keys so the same code works across expo-notifications
// versions.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function RootLayout() {
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
              <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0B0E14' } }} />
            </EventDetailProvider>
          </ErrorBoundary>
        </BottomSheetModalProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
