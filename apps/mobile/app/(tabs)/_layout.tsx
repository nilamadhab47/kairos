import { Tabs } from 'expo-router';
import { Text } from 'react-native';

const TabIcon = ({ label, focused }: { label: string; focused: boolean }) => (
  <Text style={{ color: focused ? '#FF5F1F' : '#9A9AA8', fontSize: 11 }}>{label}</Text>
);

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#15151B',
          borderTopColor: '#2A2A33',
        },
        tabBarActiveTintColor: '#FF5F1F',
        tabBarInactiveTintColor: '#9A9AA8',
      }}
    >
      <Tabs.Screen
        name="today"
        options={{
          title: 'Today',
          tabBarIcon: ({ focused }) => <TabIcon label="●" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: 'Calendar',
          tabBarIcon: ({ focused }) => <TabIcon label="□" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="alerts"
        options={{
          title: 'Alerts',
          tabBarIcon: ({ focused }) => <TabIcon label="▲" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ focused }) => <TabIcon label="⚙" focused={focused} />,
        }}
      />
    </Tabs>
  );
}
