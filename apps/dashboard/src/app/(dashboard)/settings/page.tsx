'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/nextjs';
import { useForm } from 'react-hook-form';
import { useEffect } from 'react';
import { useApi } from '@/lib/useApi';

interface Marina {
  id: string; name: string; lake: string; address: string;
  city: string; state: string; phone?: string; website?: string;
  widgetColor?: string; logoUrl?: string;
}
interface StripeStatus {
  connected: boolean; chargesEnabled?: boolean; payoutsEnabled?: boolean;
}

export default function SettingsPage() {
  const api         = useApi();
  const { isLoaded } = useAuth();
  const queryClient = useQueryClient();

  const { data: me } = useQuery<{ staff?: { marina: Marina } }>({
    queryKey: ['me'],
    queryFn:  () => api.get('/auth/me').then(r => r.data),
    enabled:  isLoaded,
  });

  const marina = me?.staff?.marina;

  const { register, handleSubmit, reset, formState: { isDirty } } = useForm<Marina>();
  useEffect(() => { if (marina) reset(marina); }, [marina, reset]);

  const saveMutation = useMutation({
    mutationFn: (data: Partial<Marina>) => api.patch(`/marinas/${marina?.id}`, data),
    onSuccess:  () => queryClient.invalidateQueries({ queryKey: ['me'] }),
  });

  const { data: stripeStatus } = useQuery<StripeStatus>({
    queryKey: ['stripe-status'],
    queryFn:  () => api.get('/payments/stripe-status').then(r => r.data),
    enabled:  !!marina,
  });

  const onboard = useMutation({
    mutationFn: async () => {
      const r = await api.post('/payments/onboard', {});
      window.location.href = r.data.url;
    },
  });

  const widgetUrl  = marina ? `${typeof window !== 'undefined' ? window.location.origin : ''}/widget/${marina.id}` : '';
  const embedCode  = `<iframe src="${widgetUrl}" width="420" height="520" frameborder="0" style="border-radius:16px;"></iframe>`;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500">Marina profile, team, and integrations</p>
      </div>

      <div className="space-y-6 max-w-2xl">
        {/* Marina Profile */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Marina Profile</h2>
          <form onSubmit={handleSubmit(d => saveMutation.mutate(d))} className="space-y-4">
            {([
              ['name',    'Marina Name'],
              ['lake',    'Lake'],
              ['address', 'Address'],
              ['city',    'City'],
              ['state',   'State'],
              ['phone',   'Phone'],
              ['website', 'Website URL'],
            ] as [keyof Marina, string][]).map(([field, label]) => (
              <div key={field}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                <input {...register(field)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
            ))}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Widget Accent Colour</label>
              <div className="flex items-center gap-3">
                <input type="color" {...register('widgetColor')}
                  className="h-9 w-16 rounded border border-gray-200 cursor-pointer" />
                <span className="text-xs text-gray-500">Used on the embeddable booking widget</span>
              </div>
            </div>
            {saveMutation.isSuccess && <p className="text-sm text-green-600">Saved successfully.</p>}
            <button type="submit" disabled={!isDirty || saveMutation.isPending}
              className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-brand-700 disabled:opacity-50">
              {saveMutation.isPending ? 'Saving…' : 'Save Changes'}
            </button>
          </form>
        </section>

        {/* Stripe Connect */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Stripe Connect</h2>
          <p className="text-sm text-gray-500 mb-4">
            Connect Stripe so Lake Pass can split payments and pay out your marina automatically.
          </p>
          {stripeStatus?.connected ? (
            <div className="flex items-center gap-3">
              <span className="text-green-600 text-xl font-bold">✓</span>
              <div>
                <p className="font-medium text-gray-900">Stripe connected</p>
                <p className="text-xs text-gray-500">
                  Charges: {stripeStatus.chargesEnabled ? 'enabled' : 'pending'} ·
                  Payouts: {stripeStatus.payoutsEnabled ? 'enabled' : 'pending'}
                </p>
              </div>
            </div>
          ) : (
            <button onClick={() => onboard.mutate()} disabled={onboard.isPending}
              className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-brand-700 disabled:opacity-60">
              {onboard.isPending ? 'Redirecting to Stripe…' : 'Connect Stripe Account'}
            </button>
          )}
        </section>

        {/* Booking Widget */}
        {marina && (
          <section className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Booking Widget</h2>
            <p className="text-sm text-gray-500 mb-3">
              Paste this snippet into your marina website so visitors can book directly.
            </p>
            <div className="bg-gray-50 rounded-lg p-3 font-mono text-xs text-gray-700 break-all select-all mb-3">
              {embedCode}
            </div>
            <a href={widgetUrl} target="_blank" rel="noopener noreferrer"
              className="text-sm text-brand-600 hover:underline">
              Preview widget ↗
            </a>
          </section>
        )}

        {/* Team & Roles */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Team &amp; Roles</h2>
          <p className="text-sm text-gray-400">
            Add staff by inviting them through your Clerk dashboard and inserting a
            <code className="mx-1 bg-gray-100 px-1 rounded text-xs">StaffMember</code>
            row with their Clerk ID and this marina's ID. Full team-management UI is planned for Phase 2.
          </p>
        </section>
      </div>
    </div>
  );
}
