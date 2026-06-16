'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { format } from 'date-fns';
import { useApi } from '@/lib/useApi';

interface Reservation {
  id: string; startDate: string; endDate: string; status: string;
  paymentStatus: string; totalAmount?: number; waiverSignedAt?: string;
  walkInName?: string;
  boat: { id: string; name: string };
  user: { name: string; email: string };
  addons?: { name: string; price: number }[];
}

interface Blockout { id: string; startDate: string; endDate: string; reason?: string }

const STATUS: Record<string,{ label: string; cls: string }> = {
  pending:     { label: 'Pending',     cls: 'bg-amber-100 text-amber-700'  },
  confirmed:   { label: 'Confirmed',   cls: 'bg-blue-100 text-blue-700'    },
  checked_in:  { label: 'Checked In',  cls: 'bg-green-100 text-green-700'  },
  checked_out: { label: 'Checked Out', cls: 'bg-gray-100 text-gray-600'    },
  cancelled:   { label: 'Cancelled',   cls: 'bg-red-100 text-red-600'      },
  no_show:     { label: 'No Show',     cls: 'bg-gray-100 text-gray-400'    },
};

interface BlockoutForm { boatId: string; startDate: string; endDate: string; reason: string }

export default function ReservationList() {
  const api         = useApi();
  const queryClient = useQueryClient();
  const [tab, setTab]               = useState<'upcoming'|'blockouts'>('upcoming');
  const [expanded, setExpanded]     = useState<string|null>(null);
  const [blockoutOpen, setBlockoutOpen] = useState(false);

  const { data: reservations = [], isLoading } = useQuery<Reservation[]>({
    queryKey: ['marina-reservations'],
    queryFn:  () => api.get('/reservations/marina').then(r => r.data),
    refetchInterval: 10_000, // poll every 10s for real-time feel
  });

  const { data: boats = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['boats','mine'],
    queryFn:  () => api.get('/boats/mine').then(r => r.data),
  });

  const { data: blockouts = [] } = useQuery<Blockout[]>({
    queryKey: ['blockouts'],
    queryFn:  async () => {
      const all = await Promise.all(
        boats.map(b => api.get(`/boats/${b.id}`).then(r => (r.data.blockouts ?? []).map((bl: Blockout) => ({ ...bl, boatName: b.name }))))
      );
      return all.flat();
    },
    enabled: tab === 'blockouts' && boats.length > 0,
  });

  const act = (endpoint: string) => useMutation({
    mutationFn: (id: string) => api.patch(`/reservations/${id}/${endpoint}`, {}),
    onSuccess:  () => queryClient.invalidateQueries({ queryKey: ['marina-reservations'] }),
  });
  const confirm  = act('confirm');
  const checkIn  = act('check-in');
  const checkOut = act('check-out');
  const noShow   = act('no-show');

  const { register, handleSubmit, reset, formState: { errors } } = useForm<BlockoutForm>();
  const addBlockout = useMutation({
    mutationFn: (d: BlockoutForm) => api.post(`/boats/${d.boatId}/blockouts`, d),
    onSuccess:  () => { queryClient.invalidateQueries({ queryKey: ['blockouts'] }); setBlockoutOpen(false); reset(); },
  });
  const removeBlockout = useMutation({
    mutationFn: ({ boatId, blockoutId }: { boatId: string; blockoutId: string }) =>
      api.delete(`/boats/${boatId}/blockouts/${blockoutId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['blockouts'] }),
  });

  const active = reservations.filter(r => !['cancelled','checked_out'].includes(r.status));

  return (
    <div className="bg-white rounded-xl border border-gray-200">
      {/* Tabs */}
      <div className="flex border-b border-gray-100">
        {(['upcoming','blockouts'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-3 text-sm font-medium capitalize transition-colors ${tab === t ? 'text-brand-600 border-b-2 border-brand-600' : 'text-gray-500 hover:text-gray-700'}`}>
            {t === 'blockouts' ? 'Maintenance / Blockouts' : 'Upcoming'}
          </button>
        ))}
      </div>

      <div className="p-4">
        {tab === 'upcoming' ? (
          <>
            {isLoading && <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-20 bg-gray-50 rounded-lg animate-pulse" />)}</div>}
            {!isLoading && active.length === 0 && <p className="text-sm text-gray-400">No upcoming reservations.</p>}

            <div className="space-y-2">
              {active.slice(0,20).map(r => {
                const s = STATUS[r.status] ?? { label: r.status, cls: 'bg-gray-100 text-gray-600' };
                const isExpanded = expanded === r.id;
                return (
                  <div key={r.id} className="border border-gray-100 rounded-lg">
                    <button className="w-full text-left p-3" onClick={() => setExpanded(isExpanded ? null : r.id)}>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="font-medium text-gray-900 text-sm truncate">
                          {r.walkInName ? `👤 ${r.walkInName}` : r.user?.name} — {r.boat?.name}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${s.cls}`}>{s.label}</span>
                      </div>
                      <p className="text-xs text-gray-400">
                        {format(new Date(r.startDate),'MMM d')} – {format(new Date(r.endDate),'MMM d, yyyy')}
                        {r.totalAmount != null && <> · ${r.totalAmount.toFixed(2)}</>}
                      </p>
                    </button>

                    {isExpanded && (
                      <div className="px-3 pb-3 border-t border-gray-50 pt-2 space-y-2">
                        {r.addons && r.addons.length > 0 && (
                          <p className="text-xs text-gray-500">Add-ons: {r.addons.map(a => `${a.name} ($${a.price})`).join(', ')}</p>
                        )}
                        {/* Waiver status */}
                        <div className={`text-xs rounded px-2 py-1 inline-flex items-center gap-1 ${r.waiverSignedAt ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                          {r.waiverSignedAt ? `✓ Waiver signed ${format(new Date(r.waiverSignedAt),'MMM d')}` : '⚠ Waiver not yet signed'}
                        </div>

                        <div className="flex gap-1 flex-wrap">
                          {r.status === 'pending' && (
                            <button onClick={() => confirm.mutate(r.id)}
                              className="text-xs bg-blue-600 text-white rounded px-2 py-1 hover:bg-blue-700">Confirm</button>
                          )}
                          {r.status === 'confirmed' && (
                            <button
                              onClick={() => {
                                if (!r.waiverSignedAt) { alert('Waiver must be signed before check-in.'); return; }
                                checkIn.mutate(r.id);
                              }}
                              className={`text-xs text-white rounded px-2 py-1 ${r.waiverSignedAt ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-400 cursor-not-allowed'}`}>
                              Check In
                            </button>
                          )}
                          {r.status === 'checked_in' && (
                            <button onClick={() => checkOut.mutate(r.id)}
                              className="text-xs bg-gray-600 text-white rounded px-2 py-1 hover:bg-gray-700">Check Out</button>
                          )}
                          {['pending','confirmed'].includes(r.status) && (
                            <button onClick={() => noShow.mutate(r.id)}
                              className="text-xs text-gray-500 border border-gray-200 rounded px-2 py-1 hover:bg-gray-50">No Show</button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <div className="flex justify-between items-center mb-3">
              <p className="text-sm font-medium text-gray-700">Maintenance &amp; blocked dates</p>
              <button onClick={() => setBlockoutOpen(true)}
                className="text-xs bg-brand-600 text-white px-3 py-1.5 rounded-lg hover:bg-brand-700">+ Add</button>
            </div>

            {blockoutOpen && (
              <form onSubmit={handleSubmit(d => addBlockout.mutate(d))} className="bg-gray-50 rounded-lg p-3 mb-3 space-y-2">
                <select className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm"
                  {...register('boatId', { required: true })}>
                  <option value="">Select boat…</option>
                  {boats.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
                <div className="grid grid-cols-2 gap-2">
                  <input type="date" className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm"
                    {...register('startDate', { required: true })} />
                  <input type="date" className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm"
                    {...register('endDate', { required: true })} />
                </div>
                <input type="text" placeholder="Reason (e.g. Annual maintenance)"
                  className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm"
                  {...register('reason')} />
                <div className="flex gap-2">
                  <button type="button" onClick={() => { setBlockoutOpen(false); reset(); }}
                    className="flex-1 border border-gray-200 rounded-lg py-1.5 text-xs">Cancel</button>
                  <button type="submit" disabled={addBlockout.isPending}
                    className="flex-1 bg-brand-600 text-white rounded-lg py-1.5 text-xs font-semibold disabled:opacity-60">
                    {addBlockout.isPending ? 'Adding…' : 'Add Blockout'}
                  </button>
                </div>
              </form>
            )}

            {blockouts.length === 0
              ? <p className="text-sm text-gray-400">No blockouts set.</p>
              : <div className="space-y-2">
                  {(blockouts as any[]).map((bl: any) => (
                    <div key={bl.id} className="flex items-center justify-between border border-gray-100 rounded-lg p-3">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{bl.boatName}</p>
                        <p className="text-xs text-gray-500">
                          {format(new Date(bl.startDate),'MMM d')} – {format(new Date(bl.endDate),'MMM d')}
                          {bl.reason && ` · ${bl.reason}`}
                        </p>
                      </div>
                      <button onClick={() => removeBlockout.mutate({ boatId: bl.boatId ?? bl.boat?.id, blockoutId: bl.id })}
                        className="text-xs text-red-500 hover:text-red-700">Remove</button>
                    </div>
                  ))}
                </div>
            }
          </>
        )}
      </div>
    </div>
  );
}
