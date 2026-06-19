'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@clerk/nextjs';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  LineChart, Line, CartesianGrid, Legend,
} from 'recharts';
import { useApi } from '@/lib/useApi';

interface Reports {
  totalRevenue:       number;
  totalBookings:      number;
  activeBoats:        number;
  utilization:        { boatId: string; boatName: string; bookedDays: number; bookingCount: number }[];
  peakByDow:          { label: string; bookings: number }[];
  peakByMonth:        { month: string; bookings: number }[];
  recentReservations: any[];
}

const COLORS = ['#3b82f6','#10b981','#f59e0b','#8b5cf6','#ef4444','#06b6d4'];

export default function ReportsPage() {
  const api = useApi();
  const { isLoaded } = useAuth();

  const { data: me } = useQuery<{ staff?: { marina: { id: string; name: string } } }>({
    queryKey: ['me'],
    queryFn:  () => api.get('/auth/me').then(r => r.data),
    enabled:  isLoaded,
  });

  const marinaId   = me?.staff?.marina?.id;
  const marinaName = me?.staff?.marina?.name ?? 'Marina';

  const { data: reports, isLoading } = useQuery<Reports>({
    queryKey: ['reports', marinaId],
    queryFn:  () => api.get(`/marinas/${marinaId}/reports`).then(r => r.data),
    enabled:  !!marinaId,
  });

  // ── CSV export ───────────────────────────────────────────────────────────────
  const handleExportCsv = () => {
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

  // ── PDF export ────────────────────────────────────────────────────────────────
  const handleExportPdf = () => {
    if (!reports) return;
    const date = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const rows = reports.utilization.map(u =>
      `<tr><td>${u.boatName}</td><td>${u.bookingCount}</td><td>${u.bookedDays}</td></tr>`
    ).join('');
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Lake Pass Report – ${marinaName}</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 40px; color: #111; }
    h1   { font-size: 22px; margin-bottom: 4px; }
    p    { color: #666; font-size: 13px; margin-bottom: 32px; }
    .stats { display: flex; gap: 24px; margin-bottom: 32px; }
    .stat  { border: 1px solid #e5e7eb; border-radius: 10px; padding: 16px 24px; min-width: 130px; }
    .stat-label { font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; }
    .stat-value { font-size: 24px; font-weight: 700; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th    { text-align: left; padding: 8px 12px; background: #f9fafb; border-bottom: 1px solid #e5e7eb; font-size: 11px; color: #6b7280; text-transform: uppercase; }
    td    { padding: 10px 12px; border-bottom: 1px solid #f3f4f6; }
    @media print { body { margin: 20px; } }
  </style>
</head>
<body>
  <h1>Lake Pass – ${marinaName}</h1>
  <p>Report generated ${date}</p>
  <div class="stats">
    <div class="stat"><div class="stat-label">Total Revenue</div><div class="stat-value">$${reports.totalRevenue.toFixed(2)}</div></div>
    <div class="stat"><div class="stat-label">Total Bookings</div><div class="stat-value">${reports.totalBookings}</div></div>
    <div class="stat"><div class="stat-label">Active Boats</div><div class="stat-value">${reports.activeBoats}</div></div>
  </div>
  <table>
    <thead><tr><th>Boat</th><th>Bookings</th><th>Days Booked</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
  };

  const stats = [
    { label: 'Total Revenue',  value: `$${(reports?.totalRevenue  ?? 0).toFixed(2)}` },
    { label: 'Total Bookings', value: String(reports?.totalBookings ?? 0) },
    { label: 'Active Boats',   value: String(reports?.activeBoats  ?? 0) },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
          <p className="text-gray-500">Analytics and performance insights</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleExportCsv} disabled={!reports}
            className="text-sm border border-gray-300 rounded-lg px-4 py-2 hover:bg-gray-50 disabled:opacity-50">
            Export CSV
          </button>
          <button onClick={handleExportPdf} disabled={!reports}
            className="text-sm border border-gray-300 rounded-lg px-4 py-2 hover:bg-gray-50 disabled:opacity-50">
            Export PDF
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[1,2,3].map(i => <div key={i} className="h-20 bg-white rounded-xl border border-gray-200 animate-pulse" />)}
        </div>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            {stats.map(s => (
              <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-5">
                <p className="text-sm text-gray-500">{s.label}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{s.value}</p>
              </div>
            ))}
          </div>

          {/* Customer feedback */}
          {reports?.recentReservations && (() => {
            const withReviews = reports.recentReservations.filter((r: any) => r.boat?.reviews?.length);
            if (!withReviews.length) return null;
            return (
              <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
                <h2 className="text-base font-semibold text-gray-900 mb-3">Recent customer reviews</h2>
                <div className="space-y-3">
                  {withReviews.slice(0, 5).map((r: any) => r.boat.reviews.slice(0, 1).map((rv: any) => (
                    <div key={rv.id} className="flex items-start gap-3">
                      <span className="text-yellow-400 text-sm">{'★'.repeat(rv.rating)}{'☆'.repeat(5 - rv.rating)}</span>
                      <p className="text-sm text-gray-700">{rv.comment ?? 'No comment.'}</p>
                    </div>
                  )))}
                </div>
              </div>
            );
          })()}

          {/* Boat utilisation chart */}
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

          {/* Peak times — day of week */}
          {reports?.peakByDow && (
            <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
              <h2 className="text-base font-semibold text-gray-900 mb-1">Peak booking days</h2>
              <p className="text-xs text-gray-400 mb-4">Number of bookings that started on each day of the week</p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={reports.peakByDow} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v: any) => [v, 'Bookings']} />
                  <Bar dataKey="bookings" fill="#3b82f6" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Peak times — monthly trend */}
          {reports?.peakByMonth && (
            <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
              <h2 className="text-base font-semibold text-gray-900 mb-1">Monthly booking trend</h2>
              <p className="text-xs text-gray-400 mb-4">Bookings per month over the last 12 months</p>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={reports.peakByMonth} margin={{ top: 0, right: 16, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v: any) => [v, 'Bookings']} />
                  <Line type="monotone" dataKey="bookings" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Utilisation table */}
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
