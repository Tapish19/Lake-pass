/**
 * useRealtimeTable
 *
 * Subscribes to Supabase Realtime for any PostgreSQL table.
 * On any INSERT/UPDATE/DELETE, invalidates the given React Query keys.
 *
 * Falls back gracefully when NEXT_PUBLIC_SUPABASE_URL is not set
 * (local dev / non-Supabase deployments). In that case, configure
 * refetchInterval on your queries instead.
 *
 * Usage:
 *   useRealtimeTable(queryClient, 'reservations', [['marina-reservations']]);
 */
import { useEffect, useRef } from 'react';
import { useQueryClient, QueryKey } from '@tanstack/react-query';

export function useRealtimeTable(
  queryClient: ReturnType<typeof useQueryClient>,
  table: string,
  queryKeys: QueryKey[],
) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const channelRef  = useRef<any>(null);

  useEffect(() => {
    if (!supabaseUrl || !supabaseKey) return;

    import('@supabase/supabase-js').then(({ createClient }) => {
      const supabase = createClient(supabaseUrl, supabaseKey);
      const channel  = supabase
        .channel(`realtime:${table}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table },
          () => {
            queryKeys.forEach(key => queryClient.invalidateQueries({ queryKey: key }));
          },
        )
        .subscribe();

      channelRef.current = { supabase, channel };
    });

    return () => {
      channelRef.current?.supabase?.removeChannel(channelRef.current.channel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabaseUrl, supabaseKey, table]);
}
