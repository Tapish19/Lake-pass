import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

const isPublicRoute = createRouteMatcher([
  '/login(.*)',
  '/register(.*)',
  '/widget(.*)',
]);

/**
 * MFA enforcement for the marina dashboard.
 *
 * The dashboard handles financial data, customer PII, and Stripe payouts,
 * so MFA is required for all authenticated staff sessions.
 *
 * How it works:
 * 1. Clerk's `auth()` returns `sessionClaims` which includes `fva` (factor
 *    verification age) — a tuple of [factor1AgeSeconds, factor2AgeSeconds].
 * 2. If `factor2AgeSeconds` is -1, the user has NOT completed a second factor.
 * 3. We redirect them to /mfa-required which prompts them to set up / verify MFA.
 *
 * To enable MFA enforcement in Clerk dashboard:
 *   - Go to Clerk Dashboard → User & Authentication → Multi-factor
 *   - Set "Require MFA" for your application or specific roles
 *   - This middleware is an additional server-side guard
 */
const isMfaSetupRoute = createRouteMatcher(['/mfa-required(.*)']);

export default clerkMiddleware(async (auth, req) => {
  const { userId, sessionClaims } = await auth();

  // Unauthenticated → redirect to login
  if (!userId && !isPublicRoute(req)) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('redirect_url', req.url);
    return NextResponse.redirect(loginUrl);
  }

  // Authenticated but hasn't completed MFA → redirect to MFA prompt
  // `fva` = [firstFactorAge, secondFactorAge]; -1 means not verified.
  if (userId && !isPublicRoute(req) && !isMfaSetupRoute(req)) {
    const fva = (sessionClaims as any)?.fva as [number, number] | undefined;
    const mfaVerified = fva ? fva[1] !== -1 : false;

    // Only enforce MFA if it's configured (REQUIRE_MFA env var or session has fva claim)
    const mfaConfigured = process.env.NEXT_PUBLIC_REQUIRE_MFA === 'true' || fva !== undefined;

    if (mfaConfigured && !mfaVerified) {
      const mfaUrl = new URL('/mfa-required', req.url);
      mfaUrl.searchParams.set('redirect_url', req.url);
      return NextResponse.redirect(mfaUrl);
    }
  }
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip)).*)',
    '/(api|trpc)(.*)',
  ],
};
