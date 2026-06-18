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

  const { data: me } = useQuery<{
    staff?: { marina: { id: string }; role: string };
    hasCompletedOnboarding?: boolean;
  }>({
    queryKey: ['me'],
    queryFn:  () => api.get('/auth/me').then(r => r.data),
    enabled:  !!userId,
  });

  useEffect(() => {
    if (isLoaded && !userId) redirect('/login');
  }, [isLoaded, userId]);

  const marinaId         = me?.staff?.marina?.id;
  const isOwner          = me?.staff?.role === 'owner';
  // Show wizard if: owner, marina loaded, not dismissed, and onboarding not yet completed
  const showWizard = !!marinaId && isOwner && !wizardDismissed && me?.hasCompletedOnboarding === false;

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
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
