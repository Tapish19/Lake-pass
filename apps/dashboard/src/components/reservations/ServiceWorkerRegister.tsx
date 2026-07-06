'use client';

import { useEffect } from 'react';

/** Registers /sw.js so the staff calendar still renders (read-only, from cache) when offline. */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(err => {
      console.warn('[sw] registration failed', err);
    });
  }, []);

  return null;
}
