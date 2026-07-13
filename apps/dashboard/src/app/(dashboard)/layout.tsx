// path: apps/dashboard/src/app/(dashboard)/layout.tsx

'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@clerk/nextjs';
import { redirect } from 'next/navigation';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import OnboardingWizard from '@/components/onboarding/OnboardingWizard';
import { useApi } from '@/lib/useApi';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { userId, isLoaded } = useAuth();
  const api = useApi();
  const [wizardDismissed, setWizardDismissed] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const { data: me, isLoading: isLoadingMe, error: meError } = useQuery<{
    staff?: { marina: { id: string }; role: string } | null;
    hasCompletedOnboarding?: boolean;
  }>({
    queryKey: ['me'],
    queryFn:  () => api.get('/auth/me').then(r => r.data),
    enabled:  isLoaded && !!userId,
    retry:    false,
  });

  useEffect(() => {
    if (isLoaded && !userId) redirect('/login');
  }, [isLoaded, userId]);

  const marinaId         = me?.staff?.marina?.id;
  const isOwner          = me?.staff?.role === 'owner';
  const isResolvingStaff = !isLoaded || (!!userId && isLoadingMe && !me);
  const hasStaffAccess   = !!marinaId;
  // Show wizard if: owner, marina loaded, not dismissed, and onboarding not yet completed
  const showWizard = hasStaffAccess && isOwner && !wizardDismissed && me?.hasCompletedOnboarding === false;

  // A query error only means "no access" if we've never successfully loaded
  // `me` yet. If we already have valid staff data cached and a *background*
  // refetch fails (tab refocus, brief network blip, token refresh in
  // flight), keep showing the dashboard rather than bouncing an actual
  // owner/staff member to the "not linked" screen.
  const hasNeverLoaded = me === undefined;

  let mainContent = children;
  if (isResolvingStaff) {
    mainContent = (
      <div className="flex h-full items-center justify-center text-sm text-gray-500">
        Loading marina access…
      </div>
    );
  } else if ((meError && hasNeverLoaded) || (!meError && !hasStaffAccess)) {
    mainContent = (
      <div className="mx-auto mt-16 max-w-xl rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-950 shadow-sm">
        <h1 className="text-lg font-semibold">Marina access required</h1>
        <p className="mt-2 text-sm leading-6">
          Your Lake Pass account is signed in, but it is not linked to a marina staff role yet.
          Ask a marina owner to invite this email address, or configure the deployment owner
          environment variables so this account can claim the marina.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">{mainContent}</main>
      </div>
      {showWizard && (
        <OnboardingWizard
          marinaId={marinaId}
          onComplete={() => setWizardDismissed(true)}
        />
      )}
    </div>
  );
}
