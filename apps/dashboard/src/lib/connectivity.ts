// path: apps/dashboard/src/lib/connectivity.ts

'use client';

/**
 * Browser navigator.onLine is a useful hint, but it can report false positives
 * in browsers, VPNs, captive portals, or desktop webviews. Confirm with a
 * lightweight same-origin request before showing a persistent offline warning.
 */
export async function canReachApp(timeoutMs = 6000): Promise<boolean> {
  if (typeof window === 'undefined') return true;

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Use GET instead of HEAD: some hosts/proxies/dev-preview environments
    // don't handle HEAD cleanly and will error instead of responding, which
    // previously made us report "offline" while actually online.
    const res = await fetch(window.location.origin, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'same-origin',
      signal: controller.signal,
    });
    // Any actual HTTP response (even a 404/500) means the network path
    // works — only treat true network failures (thrown errors) as offline.
    return !!res;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timeout);
  }
}
