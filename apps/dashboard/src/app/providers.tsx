'use client';

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () => new QueryClient({
      defaultOptions: {
        queries: {
          // 10 s staleTime globally → data refreshes quickly enough to approach
          // the PRD's "<5 s real-time update" target without websocket overhead.
          staleTime:            10_000,
          refetchOnWindowFocus: true,
          retry:                1,
        },
      },
    })
  );
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
