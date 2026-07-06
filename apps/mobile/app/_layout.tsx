import { useState } from 'react';
import { Stack } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { ClerkProvider } from '@clerk/clerk-expo';
import { tokenCache } from '@/lib/tokenCache';
import OfflineBanner from '@/components/OfflineBanner';

const clerkPublishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;

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
      <QueryClientProvider client={queryClient}>
        <StatusBar style="dark" />
        <OfflineBanner />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="boat/[id]" options={{ headerShown: true, title: 'Boat Details' }} />
          <Stack.Screen name="booking/[boatId]" options={{ headerShown: true, title: 'Book' }} />
        </Stack>
      </QueryClientProvider>
    </ClerkProvider>
  );
}
