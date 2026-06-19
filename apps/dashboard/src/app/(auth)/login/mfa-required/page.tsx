'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth, UserProfile } from '@clerk/nextjs';

/**
 * Shown when a signed-in dashboard user has not completed a second
 * authentication factor (see apps/dashboard/src/middleware.ts).
 *
 * The user manages/verifies MFA via Clerk's <UserProfile> "Security" tab.
 * Once their session's `fva` (factor verification age) claim reflects a
 * verified second factor, we send them back to wherever they were headed.
 */
export default function MfaRequiredPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { sessionClaims, isLoaded } = useAuth();
  const [checking, setChecking] = useState(false);

  const redirectUrl = searchParams.get('redirect_url') || '/fleet';

  const mfaVerified = (() => {
    const fva = (sessionClaims as any)?.fva as [number, number] | undefined;
    return fva ? fva[1] !== -1 : false;
  })();

  // Once MFA is verified, bounce back to the page the user originally wanted.
  useEffect(() => {
    if (isLoaded && mfaVerified) {
      router.replace(redirectUrl);
    }
  }, [isLoaded, mfaVerified, redirectUrl, router]);

  // Clerk doesn't push fresh session claims to the client automatically
  // after a factor is added, so poll briefly after the user interacts with
  // the UserProfile widget to pick up the updated `fva` claim.
  const handlePossibleUpdate = () => {
    if (checking) return;
    setChecking(true);
    let attempts = 0;
    const interval = setInterval(() => {
      attempts += 1;
      router.refresh();
      if (attempts >= 5) {
        clearInterval(interval);
        setChecking(false);
      }
    }, 1500);
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-brand-50 px-4 py-12">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-brand-900">
            Two-step verification required
          </h1>
          <p className="text-gray-500 mt-2">
            Lake Pass handles financial data and customer PII, so we require
            a second factor on every staff account. Add or verify a second
            factor below to continue to your dashboard.
          </p>
        </div>
        <div onClickCapture={handlePossibleUpdate}>
          <UserProfile
            routing="hash"
            appearance={{
              elements: {
                rootBox: 'mx-auto',
                card: 'shadow-md',
              },
            }}
          />
        </div>
        {checking && (
          <p className="text-center text-sm text-gray-400 mt-4">
            Checking verification status…
          </p>
        )}
      </div>
    </main>
  );
}
