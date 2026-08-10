import { Tabs } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { EventDetailProvider, PushRegistrar, TabIcon } from '@/components';
import { useTheme } from '@/design';

function TabLabel({ label, focused, color }: { label: string; focused: boolean; color: string }) {
  return (
    <Text
      style={{
        fontSize: 11,
        fontWeight: focused ? '700' : '500',
        color,
        marginTop: 2,
      }}
    >
      {label}
    </Text>
  );
}

export default function TabsLayout() {
  const theme = useTheme();

  return (
    <EventDetailProvider>
      <PushRegistrar />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: theme.color.bgElevated,
            borderTopColor: theme.color.border,
            borderTopWidth: StyleSheet.hairlineWidth,
            height: 68,
            paddingBottom: 10,
            paddingTop: 8,
          },
          tabBarActiveTintColor: theme.color.accent,
          tabBarInactiveTintColor: theme.color.textMuted,
        }}
      >
        <Tabs.Screen
          name="today"
          options={{
            title: 'Today',
            tabBarIcon: ({ color, focused }) => (
              <View style={styles.iconWrap}>
                <TabIcon name="today" color={color} focused={focused} />
              </View>
            ),
            tabBarLabel: ({ focused, color }) => (
              <TabLabel label="Today" focused={focused} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="calendar"
          options={{
            title: 'Calendar',
            tabBarIcon: ({ color, focused }) => (
              <View style={styles.iconWrap}>
                <TabIcon name="calendar" color={color} focused={focused} />
              </View>
            ),
            tabBarLabel: ({ focused, color }) => (
              <TabLabel label="Calendar" focused={focused} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="alerts"
          options={{
            title: 'Alerts',
            tabBarIcon: ({ color, focused }) => (
              <View style={styles.iconWrap}>
                <TabIcon name="alerts" color={color} focused={focused} />
              </View>
            ),
            tabBarLabel: ({ focused, color }) => (
              <TabLabel label="Alerts" focused={focused} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: 'Settings',
            tabBarIcon: ({ color, focused }) => (
              <View style={styles.iconWrap}>
                <TabIcon name="settings" color={color} focused={focused} />
              </View>
            ),
            tabBarLabel: ({ focused, color }) => (
              <TabLabel label="Settings" focused={focused} color={color} />
            ),
          }}
        />
      </Tabs>
    </EventDetailProvider>
  );
}

const styles = StyleSheet.create({
  iconWrap: { alignItems: 'center', justifyContent: 'center' },
});
