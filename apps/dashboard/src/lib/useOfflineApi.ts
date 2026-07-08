'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useApi } from './useApi';
import { canReachApp } from './connectivity';
import { enqueueAction, flushQueue, getQueueLength, isQueueable } from './offlineQueue';

/**
 * Drop-in replacement for useApi() for staff actions that should survive
 * spotty marina wifi: check-in/out, walk-in bookings, blockouts, notes.
 *
 * - Online: behaves exactly like the normal api instance.
 * - Offline (or a request fails due to a network error): the mutation is
 *   queued in localStorage and resolved optimistically so the UI can show
 *   "saved, will sync" instead of an error.
 * - Reconnect: queued actions replay automatically, in order.
 *
 * Payment/Stripe endpoints are explicitly excluded (see offlineQueue.ts) and
 * will throw as normal when offline rather than being queued.
 */
export function useOfflineApi() {
  const api = useApi();
  const [pendingCount, setPendingCount] = useState(0);
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const flushing = useRef(false);

  const refreshPendingCount = () => setPendingCount(getQueueLength());

  useEffect(() => {
    refreshPendingCount();

    const handleOnline = async () => {
      setIsOnline(true);
      if (flushing.current) return;
      flushing.current = true;
      await flushQueue(api);
      flushing.current = false;
      refreshPendingCount();
    };
    const confirmOffline = async () => {
      setIsOnline((await canReachApp()) ? true : false);
    };
    const handleOffline = () => {
      // navigator.onLine can be wrong in some browsers/environments. Verify
      // reachability before showing the persistent offline banner.
      void confirmOffline();
    };
    const handleQueueChange = () => refreshPendingCount();

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('lake-pass-offline-queue-change', handleQueueChange);

    const reachabilityCheck = window.setInterval(() => {
      if (!navigator.onLine) void confirmOffline();
    }, 15000);

    // Attempt a flush on mount too, in case actions were queued in a
    // previous session and the tab reloaded while already online.
    if (navigator.onLine) handleOnline();
    else void confirmOffline();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('lake-pass-offline-queue-change', handleQueueChange);
      window.clearInterval(reachabilityCheck);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  const offlineApi = useMemo(() => {
    const wrap = (method: 'post' | 'patch' | 'delete' | 'put') =>
      async (url: string, body: any, description: string) => {
        const browserReportsOffline = typeof navigator !== 'undefined' && !navigator.onLine;
        const shouldQueue = browserReportsOffline && isQueueable(url) && !(await canReachApp());
        if (shouldQueue) {
          setIsOnline(false);
          enqueueAction({ method, url, body, description });
          refreshPendingCount();
          return { queued: true };
        }
        if (browserReportsOffline) setIsOnline(true);
        try {
          return await (api as any)[method](url, body);
        } catch (err: any) {
          // Network error (not a server error) while we thought we were
          // online — connectivity events can lag reality. Queue it rather
          // than losing the staff member's action.
          const isNetworkError = !err?.response;
          if (isNetworkError && isQueueable(url)) {
            enqueueAction({ method, url, body, description });
            refreshPendingCount();
            return { queued: true };
          }
          throw err;
        }
      };

    return {
      get: api.get.bind(api), // reads are never queued — offline reads come from the service worker cache instead
      post: wrap('post'),
      patch: wrap('patch'),
      put: wrap('put'),
      delete: wrap('delete'),
    };
  }, [api]);

  return { api: offlineApi, isOnline, pendingCount };
}
