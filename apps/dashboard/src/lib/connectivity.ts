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
    // Hit a dedicated, unauthenticated health-check route rather than the
    // app's own "/" — fetching the full page can be slow (SSR/cold start)
    // or blocked by Vercel Deployment Protection redirects, both of which
    // previously made us report "offline" while actually online.
    const res = await fetch(`${window.location.origin}/api/ping`, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'same-origin',
      signal: controller.signal,
    });
    // Any actual HTTP response (even a non-2xx) means the network path
    // works — only treat true network failures (thrown errors) as offline.
    return !!res;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timeout);
  }
}
