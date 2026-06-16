'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@clerk/nextjs';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { useApi } from '@/lib/useApi';

interface Reports {
  totalRevenue:   number;
  totalBookings:  number;
  activeBoats:    number;
  utilization:    { boatId: string; boatName: string; bookedDays: number; bookingCount: number }[];
  recentReservations: any[];
}

const COLORS = ['#3b82f6','#10b981','#f59e0b','#8b5cf6','#ef4444','#06b6d4'];

export default function ReportsPage() {
  const api = useApi();
  const { isLoaded } = useAuth();

  const { data: me } = useQuery<{ staff?: { marina: { id: string } } }>({
    queryKey: ['me'],
    queryFn:  () => api.get('/auth/me').then(r => r.data),
    enabled:  isLoaded,
  });

  const marinaId = me?.staff?.marina?.id;

  const { data: reports, isLoading } = useQuery<Reports>({
    queryKey: ['reports', marinaId],
    queryFn:  () => api.get(`/marinas/${marinaId}/reports`).then(r => r.data),
    enabled:  !!marinaId,
  });

  const handleExport = () => {
    if (!reports) return;
    const rows = [
      ['Boat', 'Bookings', 'Booked Days'],
      ...reports.utilization.map(u => [u.boatName, u.bookingCount, u.bookedDays]),
    ];
    const csv  = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), {
      href: url, download: `lake-pass-report-${new Date().toISOString().slice(0,10)}.csv`,
    });
    a.click();
    URL.revokeObjectURL(url);
  };

  const stats = [
    { label: 'Total Revenue',  value: `$${(reports?.totalRevenue  ?? 0).toFixed(2)}` },
    { label: 'Total Bookings', value: String(reports?.totalBookings ?? 0) },
    { label: 'Active Boats',   value: String(reports?.activeBoats  ?? 0) },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
          <p className="text-gray-500">Analytics and performance insights</p>
        </div>
        <button onClick={handleExport} disabled={!reports}
          className="text-sm border border-gray-300 rounded-lg px-4 py-2 hover:bg-gray-50 disabled:opacity-50">
          Export CSV
        </button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[1,2,3].map(i => <div key={i} className="h-20 bg-white rounded-xl border border-gray-200 animate-pulse" />)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            {stats.map(s => (
              <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-5">
                <p className="text-sm text-gray-500">{s.label}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{s.value}</p>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Boat utilisation (days booked)</h2>
            {reports?.utilization.length ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={reports.utilization} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <XAxis dataKey="boatName" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v: any) => [`${v} days`, 'Booked']} />
                  <Bar dataKey="bookedDays" radius={[4,4,0,0]}>
                    {reports.utilization.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-gray-400 text-sm">No booking data yet.</p>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">Utilisation breakdown</h2>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-6 py-3 text-xs text-gray-500 font-medium">Boat</th>
                  <th className="text-right px-6 py-3 text-xs text-gray-500 font-medium">Bookings</th>
                  <th className="text-right px-6 py-3 text-xs text-gray-500 font-medium">Days booked</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {reports?.utilization.map(u => (
                  <tr key={u.boatId}>
                    <td className="px-6 py-3 font-medium text-gray-900">{u.boatName}</td>
                    <td className="px-6 py-3 text-right text-gray-600">{u.bookingCount}</td>
                    <td className="px-6 py-3 text-right text-gray-600">{u.bookedDays}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
