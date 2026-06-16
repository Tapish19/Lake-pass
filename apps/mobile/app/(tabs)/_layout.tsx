import { Tabs } from 'expo-router';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown:      false,
        tabBarActiveTintColor:   '#1d6fdb',
        tabBarInactiveTintColor: '#9ca3af',
        tabBarStyle: {
          borderTopWidth:   1,
          borderTopColor:   '#f1f5f9',
          backgroundColor:  '#fff',
          paddingBottom:    4,
          height:           58,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="index"   options={{ title: 'Home',    tabBarIcon: ({ color }) => <TabIcon emoji="🏠" color={color} /> }} />
      <Tabs.Screen name="search"  options={{ title: 'Search',  tabBarIcon: ({ color }) => <TabIcon emoji="🔍" color={color} /> }} />
      <Tabs.Screen name="map"     options={{ title: 'Map',     tabBarIcon: ({ color }) => <TabIcon emoji="🗺️"  color={color} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color }) => <TabIcon emoji="👤" color={color} /> }} />
    </Tabs>
  );
}

function TabIcon({ emoji, color }: { emoji: string; color: string }) {
  return (
    <span style={{ fontSize: 20, opacity: color === '#1d6fdb' ? 1 : 0.5 }}>{emoji}</span>
  );
}
