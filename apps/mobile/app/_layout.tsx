import { useState } from 'react';
import { Stack } from 'expo-router';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { ClerkProvider } from '@clerk/clerk-expo';
import { tokenCache } from '@/lib/tokenCache';
import OfflineBanner from '@/components/OfflineBanner';

const clerkPublishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;

// Cached to disk so boat listings, search results, and "My Bookings" still
// render (read-only) when the device has no signal — e.g. out on the lake.
const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key:     'lake-pass-query-cache',
});

export default function RootLayout() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000,
            // Cached data is kept around for 24h so it's there offline even
            // after the app has been closed for a while.
            gcTime: 24 * 60 * 60 * 1000,
            refetchOnWindowFocus: false,
            // Don't burn retries hammering a dead connection — fail fast and
            // fall back to cache.
            retry: 1,
          },
        },
      })
  );

  return (
    <ClerkProvider publishableKey={clerkPublishableKey} tokenCache={tokenCache}>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister: asyncStoragePersister,
          maxAge:    24 * 60 * 60 * 1000,
          // Only persist read data — mutations/queued writes are not safe to
          // silently replay across app restarts without confirmation.
          dehydrateOptions: {
            shouldDehydrateQuery: (query) => query.state.status === 'success',
          },
        }}
      >
        <StatusBar style="dark" />
        <OfflineBanner />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="boat/[id]" options={{ headerShown: true, title: 'Boat Details' }} />
          <Stack.Screen name="booking/[boatId]" options={{ headerShown: true, title: 'Book' }} />
        </Stack>
      </PersistQueryClientProvider>
    </ClerkProvider>
  );
}
