import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import * as Network from 'expo-network';

/**
 * Thin banner that appears when the device is offline, so people know
 * they're looking at cached data (calendars/listings) and that any queued
 * actions will send once they're back online.
 */
export default function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    let mounted = true;
    const check = async () => {
      try {
        const state = await Network.getNetworkStateAsync();
        if (mounted) setIsOffline(state.isConnected === false || state.isInternetReachable === false);
      } catch {
        // expo-network unavailable (e.g. web) — assume online
      }
    };
    check();
    const interval = setInterval(check, 5000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  if (!isOffline) return null;

  return (
    <View style={st.banner}>
      <Text style={st.text}>You're offline — showing cached data. Actions will sync once you're back online.</Text>
    </View>
  );
}

const st = StyleSheet.create({
  banner: { backgroundColor: '#fef3c7', paddingVertical: 6, paddingHorizontal: 12 },
  text:   { color: '#92400e', fontSize: 12, textAlign: 'center', fontWeight: '600' },
});
