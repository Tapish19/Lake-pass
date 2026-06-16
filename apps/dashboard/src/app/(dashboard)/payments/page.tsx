'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useApi } from '@/lib/useApi';

interface Summary { monthRevenue: number; totalGross: number; platformFees: number; pendingCount: number }
interface StripeStatus { connected: boolean; chargesEnabled?: boolean; payoutsEnabled?: boolean }
interface Reservation {
  id: string; totalAmount?: number; paymentStatus: string; status: string;
  createdAt: string; boat: { name: string }; user: { name: string };
}

const PAY_CLS: Record<string,string> = {
  paid:               'bg-green-100 text-green-700',
  unpaid:             'bg-amber-100 text-amber-700',
  deposit_paid:       'bg-blue-100 text-blue-700',
  refunded:           'bg-gray-100 text-gray-600',
  partially_refunded: 'bg-orange-100 text-orange-700',
};

function RefundModal({ reservation, onClose }: { reservation: Reservation; onClose: () => void }) {
  const api         = useApi();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState('');
  const [mode, setMode]     = useState<'full'|'partial'>('full');

  const refundMutation = useMutation({
    mutationFn: () => api.post('/payments/refund', {
      reservationId: reservation.id,
      ...(mode === 'partial' && amount ? { amountCents: Math.round(Number(amount) * 100) } : {}),
    }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['marina-reservations','payment-summary'] }); onClose(); },
  });

  const damageMutation = useMutation({
    mutationFn: () => api.post('/payments/damage-fee', {
      reservationId: reservation.id,
      amountCents: Math.round(Number(amount) * 100),
      description: 'Damage fee',
    }).then(r => { if (r.data.url) window.open(r.data.url,'_blank'); }),
    onSuccess: onClose,
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <h3 className="font-semibold text-gray-900 mb-1">Payment Action</h3>
        <p className="text-sm text-gray-500 mb-4">{reservation.boat?.name} — {reservation.user?.name}</p>

        <div className="flex gap-2 mb-4">
          {(['full','partial'] as const).map(m => (
            <button key={m} onClick={() => setMode(m)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${mode === m ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 text-gray-600'}`}>
              {m === 'full' ? 'Full Refund' : 'Partial / Damage'}
            </button>
          ))}
        </div>

        {mode === 'partial' && (
          <div className="mb-4">
            <label className="block text-sm text-gray-700 mb-1">Amount ($)</label>
            <input type="number" step="0.01" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>
        )}

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 border border-gray-200 rounded-lg py-2 text-sm">Cancel</button>
          <button onClick={() => refundMutation.mutate()} disabled={refundMutation.isPending || (mode==='partial' && !amount)}
            className="flex-1 bg-red-600 text-white rounded-lg py-2 text-sm font-semibold disabled:opacity-60">
            {refundMutation.isPending ? 'Processing…' : 'Issue Refund'}
          </button>
          {mode === 'partial' && (
            <button onClick={() => damageMutation.mutate()} disabled={damageMutation.isPending || !amount}
              className="flex-1 bg-amber-600 text-white rounded-lg py-2 text-sm font-semibold disabled:opacity-60">
              Charge Damage
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PaymentsPage() {
  const api = useApi();
  const [actionRes, setActionRes] = useState<Reservation|null>(null);

  const { data: summary }             = useQuery<Summary>({ queryKey: ['payment-summary'], queryFn: () => api.get('/payments/summary').then(r=>r.data), refetchInterval: 30_000 });
  const { data: stripeStatus }        = useQuery<StripeStatus>({ queryKey: ['stripe-status'], queryFn: () => api.get('/payments/stripe-status').then(r=>r.data) });
  const { data: reservations = [] }   = useQuery<Reservation[]>({ queryKey: ['marina-reservations'], queryFn: () => api.get('/reservations/marina').then(r=>r.data), refetchInterval: 15_000 });

  const onboard = useMutation({ mutationFn: async () => { const r = await api.post('/payments/onboard',{}); window.location.href = r.data.url; } });

  const txns = [...reservations].sort((a,b) => new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime()).slice(0,50);

  return (
    <div>
      {actionRes && <RefundModal reservation={actionRes} onClose={() => setActionRes(null)} />}

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Payments</h1>
        <p className="text-gray-500">Revenue, payouts, refunds, and transaction history</p>
      </div>

      {stripeStatus && !stripeStatus.connected && (
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between gap-4">
          <div>
            <p className="font-semibold text-amber-900">Connect Stripe to accept payments</p>
            <p className="text-sm text-amber-700">Your marina cannot receive payouts until Stripe is connected.</p>
          </div>
          <button onClick={() => onboard.mutate()} disabled={onboard.isPending}
            className="bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-amber-700 whitespace-nowrap disabled:opacity-60">
            {onboard.isPending ? 'Redirecting…' : 'Connect Stripe'}
          </button>
        </div>
      )}
      {stripeStatus?.connected && (
        <div className="mb-6 bg-green-50 border border-green-200 rounded-xl p-3 flex gap-2 items-center">
          <span className="text-green-600 font-bold">✓</span>
          <p className="text-sm text-green-800 font-medium">
            Stripe connected · Charges {stripeStatus.chargesEnabled?'enabled':'pending'} · Payouts {stripeStatus.payoutsEnabled?'enabled':'pending'}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {[
          { label: 'This Month Revenue',   value: `$${(summary?.monthRevenue??0).toFixed(2)}` },
          { label: 'Pending Reservations', value: String(summary?.pendingCount??0) },
          { label: 'Total Platform Fees',  value: `$${(summary?.platformFees??0).toFixed(2)}` },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-sm text-gray-500">{s.label}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Transactions</h2>
        </div>
        {txns.length === 0
          ? <p className="text-gray-400 text-sm p-6">No transactions yet.</p>
          : <div className="divide-y divide-gray-50">
              {txns.map(r => (
                <div key={r.id} className="flex items-center justify-between px-6 py-4 gap-4">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 text-sm truncate">{r.boat?.name}</p>
                    <p className="text-xs text-gray-500">{r.user?.name} · {format(new Date(r.createdAt),'MMM d, yyyy')}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${PAY_CLS[r.paymentStatus]??'bg-gray-100 text-gray-600'}`}>
                      {r.paymentStatus.replace(/_/g,' ')}
                    </span>
                    <p className="text-sm font-semibold text-gray-900">{r.totalAmount!=null?`$${r.totalAmount.toFixed(2)}`:'—'}</p>
                    {r.paymentStatus === 'paid' && (
                      <button onClick={() => setActionRes(r)}
                        className="text-xs text-gray-500 border border-gray-200 rounded-lg px-2 py-1 hover:bg-gray-50">
                        Refund / Damage
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
        }
      </div>
    </div>
  );
}
