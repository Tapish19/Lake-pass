'use client';

/**
 * Browser navigator.onLine is a useful hint, but it can report false positives
 * in browsers, VPNs, captive portals, or desktop webviews. Confirm with a
 * lightweight same-origin request before showing a persistent offline warning.
 */
export async function canReachApp(timeoutMs = 3000): Promise<boolean> {
  if (typeof window === 'undefined') return true;

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    await fetch(window.location.origin, {
      method: 'HEAD',
      cache: 'no-store',
      signal: controller.signal,
    });
    return true;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timeout);
  }
}
