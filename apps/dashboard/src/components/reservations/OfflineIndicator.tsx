'use client';

import { useOfflineApi } from '@/lib/useOfflineApi';

/** Persistent small badge in the dashboard chrome showing offline/sync status. */
export default function OfflineIndicator() {
  const { isOnline, pendingCount } = useOfflineApi();

  if (isOnline && pendingCount === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-4 right-4 z-50 rounded-lg px-3 py-2 text-sm shadow-md ${
        isOnline ? 'bg-amber-100 text-amber-900' : 'bg-slate-800 text-white'
      }`}
    >
      {!isOnline && <span>You&apos;re offline — actions will save and sync automatically.</span>}
      {isOnline && pendingCount > 0 && <span>Syncing {pendingCount} pending action{pendingCount === 1 ? '' : 's'}…</span>}
      {!isOnline && pendingCount > 0 && (
        <span> ({pendingCount} queued)</span>
      )}
    </div>
  );
}
