// Minimal same-origin health check used by connectivity.ts. Intentionally
// does no auth, no data fetching, and no rendering, so it responds
// instantly and isn't affected by Vercel Deployment Protection redirects,
// cold-start SSR latency, or backend API downtime — it only tells us the
// dashboard's own origin is reachable.
export async function GET() {
  return new Response('ok', { status: 200 });
}

export const dynamic = 'force-dynamic';
