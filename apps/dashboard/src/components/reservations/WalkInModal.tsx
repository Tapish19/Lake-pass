'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { useApi } from '@/lib/useApi';
import type { Boat } from '@lake-pass/shared';

interface WalkInForm {
  boatId:      string;
  startDate:   string;
  endDate:     string;
  walkInName:  string;
  walkInPhone: string;
  walkInEmail: string;
  notes:       string;
}

export default function WalkInModal({ onClose }: { onClose: () => void }) {
  const api         = useApi();
  const queryClient = useQueryClient();
  const { register, handleSubmit, formState: { errors } } = useForm<WalkInForm>();

  const { data: boats = [] } = useQuery<Boat[]>({
    queryKey: ['boats', 'mine'],
    queryFn:  () => api.get('/boats/mine').then(r => r.data),
  });

  const mutation = useMutation({
    mutationFn: (data: WalkInForm) => api.post('/reservations/walk-in', {
      ...data,
      addonIds: [],
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marina-reservations'] });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-1">Walk-in / Phone Booking</h2>
        <p className="text-sm text-gray-500 mb-4">Create a reservation for a customer without a Lake Pass account.</p>

        <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Boat</label>
            <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              {...register('boatId', { required: 'Select a boat' })}>
              <option value="">Select a boat…</option>
              {boats.filter(b => b.status === 'available').map(b => (
                <option key={b.id} value={b.id}>{b.name} — ${b.dailyRate}/day</option>
              ))}
            </select>
            {errors.boatId && <p className="text-xs text-red-500 mt-1">{errors.boatId.message}</p>}
          </div>

          {[
            ['startDate', 'Start Date', 'date', true],
            ['endDate',   'End Date',   'date', true],
          ].map(([name, label, type, req]) => (
            <div key={name as string}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{label as string}</label>
              <input type={type as string}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                {...register(name as keyof WalkInForm, { required: req ? `${label} is required` : false })} />
              {errors[name as keyof WalkInForm] && <p className="text-xs text-red-500 mt-1">{errors[name as keyof WalkInForm]?.message}</p>}
            </div>
          ))}

          <div className="border-t border-gray-100 pt-4">
            <p className="text-sm font-medium text-gray-700 mb-3">Customer Info</p>
            {[
              ['walkInName',  'Full Name',         'text',  true],
              ['walkInPhone', 'Phone Number',       'tel',   false],
              ['walkInEmail', 'Email (optional)',   'email', false],
            ].map(([name, label, type, req]) => (
              <div key={name as string} className="mb-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">{label as string}</label>
                <input type={type as string} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  {...register(name as keyof WalkInForm, { required: req ? `${label} is required` : false })} />
                {errors[name as keyof WalkInForm] && <p className="text-xs text-red-500 mt-1">{errors[name as keyof WalkInForm]?.message}</p>}
              </div>
            ))}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              placeholder="Any special instructions…" {...register('notes')} />
          </div>

          {mutation.isError && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">
              {(mutation.error as any)?.response?.data?.error ?? 'Failed to create booking.'}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 border border-gray-200 rounded-lg py-2 text-sm">Cancel</button>
            <button type="submit" disabled={mutation.isPending}
              className="flex-1 bg-brand-600 text-white rounded-lg py-2 text-sm font-semibold disabled:opacity-60">
              {mutation.isPending ? 'Creating…' : 'Create Booking'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
