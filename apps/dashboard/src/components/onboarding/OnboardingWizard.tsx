'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useApi } from '@/lib/useApi';

interface Props { marinaId: string; onComplete: () => void }

type Step = 'welcome' | 'profile' | 'stripe' | 'boat' | 'done';
const STEPS: Step[] = ['welcome', 'profile', 'stripe', 'boat', 'done'];

const STEP_LABELS: Record<Step, string> = {
  welcome: 'Welcome',
  profile: 'Marina Profile',
  stripe:  'Payments',
  boat:    'First Boat',
  done:    'All set!',
};

interface ProfileForm {
  name: string; lake: string; address: string; city: string; state: string; phone: string; website: string;
}
interface BoatForm {
  name: string; type: string; capacity: string; dailyRate: string; description: string;
}

export default function OnboardingWizard({ marinaId, onComplete }: Props) {
  const api         = useApi();
  const queryClient = useQueryClient();

  const [step, setStep]       = useState<Step>('welcome');
  const [profile, setProfile] = useState<ProfileForm>({ name: '', lake: '', address: '', city: '', state: '', phone: '', website: '' });
  const [boat, setBoat]       = useState<BoatForm>({ name: '', type: 'Pontoon', capacity: '8', dailyRate: '', description: '' });

  const stepIdx      = STEPS.indexOf(step);
  const progressPct  = Math.round((stepIdx / (STEPS.length - 1)) * 100);

  const saveMarina = useMutation({
    mutationFn: () => api.patch(`/marinas/${marinaId}`, profile),
    onSuccess:  () => setStep('stripe'),
  });

  const onboardStripe = useMutation({
    mutationFn: async () => {
      const r = await api.post('/payments/onboard', {});
      window.location.href = r.data.url;
    },
  });

  const addBoat = useMutation({
    mutationFn: () => api.post('/boats', {
      name:       boat.name,
      type:       boat.type,
      capacity:   Number(boat.capacity),
      dailyRate:  Number(boat.dailyRate),
      description: boat.description,
      amenities:  [],
      photoUrls:  [],
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['boats'] });
      setStep('done');
    },
  });

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-brand-50 to-white flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
        {/* Progress bar */}
        <div className="h-1.5 bg-gray-100">
          <div className="h-full bg-brand-600 transition-all duration-500" style={{ width: `${progressPct}%` }} />
        </div>

        {/* Step tabs */}
        <div className="flex border-b border-gray-100">
          {STEPS.map((s, i) => (
            <div key={s} className={`flex-1 py-2 text-center text-xs font-medium transition-colors ${
              i === stepIdx ? 'text-brand-700 border-b-2 border-brand-600' :
              i < stepIdx  ? 'text-green-600' : 'text-gray-400'
            }`}>
              {i < stepIdx ? '✓' : i + 1}. {STEP_LABELS[s]}
            </div>
          ))}
        </div>

        <div className="p-6">

          {/* ── WELCOME ── */}
          {step === 'welcome' && (
            <div className="text-center py-4">
              <div className="text-5xl mb-4">⛵</div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Welcome to Lake Pass!</h2>
              <p className="text-gray-500 mb-8">Let's get your marina set up in 4 quick steps: profile, payments, and your first boat.</p>
              <button onClick={() => setStep('profile')}
                className="w-full bg-brand-600 text-white py-3 rounded-xl font-semibold hover:bg-brand-700">
                Get Started
              </button>
            </div>
          )}

          {/* ── PROFILE ── */}
          {step === 'profile' && (
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-1">Marina profile</h2>
              <p className="text-sm text-gray-500 mb-5">This info appears to guests during booking.</p>
              <div className="space-y-3">
                {([
                  ['name',    'Marina Name *'],
                  ['lake',    'Lake / Body of Water *'],
                  ['address', 'Street Address'],
                  ['city',    'City'],
                  ['state',   'State'],
                  ['phone',   'Phone'],
                  ['website', 'Website URL'],
                ] as [keyof ProfileForm, string][]).map(([field, label]) => (
                  <div key={field}>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
                    <input type="text" value={profile[field]}
                      onChange={e => setProfile(p => ({ ...p, [field]: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  </div>
                ))}
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setStep('welcome')}
                  className="flex-1 border border-gray-200 rounded-xl py-2.5 text-sm">Back</button>
                <button onClick={() => saveMarina.mutate()}
                  disabled={!profile.name || !profile.lake || saveMarina.isPending}
                  className="flex-2 bg-brand-600 text-white rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50 flex-1">
                  {saveMarina.isPending ? 'Saving…' : 'Save & Continue'}
                </button>
              </div>
              {saveMarina.isError && <p className="text-xs text-red-500 mt-2">Failed to save. Please try again.</p>}
            </div>
          )}

          {/* ── STRIPE ── */}
          {step === 'stripe' && (
            <div className="text-center py-4">
              <div className="text-5xl mb-4">💳</div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">Connect Stripe</h2>
              <p className="text-gray-500 mb-2">Lake Pass uses Stripe Connect to split payments and pay out your marina automatically.</p>
              <p className="text-sm text-gray-400 mb-8">You can skip this step and connect later in Settings, but you won't be able to accept bookings until connected.</p>
              <div className="flex flex-col gap-3">
                <button onClick={() => onboardStripe.mutate()} disabled={onboardStripe.isPending}
                  className="w-full bg-brand-600 text-white py-3 rounded-xl font-semibold hover:bg-brand-700 disabled:opacity-60">
                  {onboardStripe.isPending ? 'Redirecting to Stripe…' : 'Connect Stripe Account'}
                </button>
                <button onClick={() => setStep('boat')}
                  className="w-full border border-gray-200 py-3 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
                  Skip for now
                </button>
              </div>
            </div>
          )}

          {/* ── BOAT ── */}
          {step === 'boat' && (
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-1">Add your first boat</h2>
              <p className="text-sm text-gray-500 mb-5">You can add more boats and photos from the Fleet page later.</p>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Boat Name *</label>
                  <input type="text" value={boat.name} onChange={e => setBoat(b => ({ ...b, name: e.target.value }))}
                    placeholder="e.g. Sunset Cruiser"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Boat Type</label>
                  <select value={boat.type} onChange={e => setBoat(b => ({ ...b, type: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                    {['Pontoon','Ski Boat','Fishing Boat','Jet Ski','Sailboat','Kayak','Canoe','Other'].map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Capacity</label>
                    <input type="number" min="1" value={boat.capacity}
                      onChange={e => setBoat(b => ({ ...b, capacity: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Daily Rate ($) *</label>
                    <input type="number" min="0" step="0.01" value={boat.dailyRate}
                      onChange={e => setBoat(b => ({ ...b, dailyRate: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                  <textarea rows={2} value={boat.description}
                    onChange={e => setBoat(b => ({ ...b, description: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setStep('stripe')}
                  className="flex-1 border border-gray-200 rounded-xl py-2.5 text-sm">Back</button>
                <button onClick={() => addBoat.mutate()}
                  disabled={!boat.name || !boat.dailyRate || addBoat.isPending}
                  className="flex-1 bg-brand-600 text-white rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50">
                  {addBoat.isPending ? 'Saving…' : 'Add Boat & Finish'}
                </button>
              </div>
              {addBoat.isError && <p className="text-xs text-red-500 mt-2">Failed to add boat. Please try again.</p>}
            </div>
          )}

          {/* ── DONE ── */}
          {step === 'done' && (
            <div className="text-center py-6">
              <div className="text-5xl mb-4">🎉</div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">You're all set!</h2>
              <p className="text-gray-500 mb-8">Your marina is live on Lake Pass. Add more boats, customize your widget, and start taking bookings.</p>
              <button onClick={() => { onComplete(); queryClient.invalidateQueries({ queryKey: ['me'] }); }}
                className="w-full bg-brand-600 text-white py-3 rounded-xl font-semibold hover:bg-brand-700">
                Go to Dashboard
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
