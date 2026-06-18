'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/nextjs';
import { useApi } from '@/lib/useApi';
import type { Boat } from '@lake-pass/shared';

type LogType = 'maintenance' | 'inspection' | 'repair' | 'fuel' | 'cleaning';

const TYPE_CFG: Record<LogType, { label: string; color: string }> = {
  maintenance: { label: 'Maintenance', color: 'bg-amber-100 text-amber-700' },
  inspection:  { label: 'Inspection',  color: 'bg-blue-100 text-blue-700'   },
  repair:      { label: 'Repair',      color: 'bg-red-100 text-red-700'     },
  fuel:        { label: 'Fuel',        color: 'bg-green-100 text-green-700' },
  cleaning:    { label: 'Cleaning',    color: 'bg-gray-100 text-gray-600'   },
};

interface MaintenanceLog {
  id: string; boatId: string; type: LogType; notes?: string;
  cost?: number; performedAt: string; performedBy?: string;
}

interface LogForm {
  boatId: string; type: LogType; notes: string; cost: string; performedBy: string;
}

export default function MaintenancePage() {
  const api         = useApi();
  const { isLoaded } = useAuth();
  const queryClient = useQueryClient();

  const [selectedBoat, setSelectedBoat] = useState('');
  const [showForm, setShowForm]         = useState(false);
  const [form, setForm]                 = useState<LogForm>({ boatId: '', type: 'maintenance', notes: '', cost: '', performedBy: '' });

  const { data: me } = useQuery<{ staff?: { marina: { id: string } } }>({
    queryKey: ['me'],
    queryFn:  () => api.get('/auth/me').then(r => r.data),
    enabled:  isLoaded,
  });

  const marinaId = me?.staff?.marina?.id;

  const { data: boats = [] } = useQuery<Boat[]>({
    queryKey: ['boats', 'mine'],
    queryFn:  () => api.get('/boats/mine').then(r => r.data),
    enabled:  !!marinaId,
  });

  const { data: logs = [], isLoading } = useQuery<MaintenanceLog[]>({
    queryKey: ['maintenance', selectedBoat],
    queryFn:  () => api.get(`/maintenance?boatId=${selectedBoat}`).then(r => r.data),
    enabled:  !!selectedBoat,
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<LogForm> & { boatId: string }) =>
      api.post('/maintenance', { ...data, cost: data.cost ? Number(data.cost) : undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance', selectedBoat] });
      queryClient.invalidateQueries({ queryKey: ['boats'] });
      setShowForm(false);
      setForm({ boatId: selectedBoat, type: 'maintenance', notes: '', cost: '', performedBy: '' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/maintenance/${id}`),
    onSuccess:  () => queryClient.invalidateQueries({ queryKey: ['maintenance', selectedBoat] }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({ ...form, boatId: selectedBoat });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Maintenance Log</h1>
          <p className="text-gray-500">Track service, repairs, fuel, and inspections per boat</p>
        </div>
        {selectedBoat && (
          <button onClick={() => { setForm(f => ({ ...f, boatId: selectedBoat })); setShowForm(true); }}
            className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-brand-700">
            + Add Log Entry
          </button>
        )}
      </div>

      {/* Boat selector */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">Select a boat</label>
        <select value={selectedBoat} onChange={e => setSelectedBoat(e.target.value)}
          className="w-full max-w-sm border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
          <option value="">— choose a boat —</option>
          {boats.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-4">New Log Entry</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as LogType }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                  {(Object.keys(TYPE_CFG) as LogType[]).map(t => (
                    <option key={t} value={t}>{TYPE_CFG[t].label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea rows={3} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="Describe the work done…" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cost ($, optional)</label>
                <input type="number" min="0" step="0.01" value={form.cost}
                  onChange={e => setForm(f => ({ ...f, cost: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="0.00" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Performed by (optional)</label>
                <input type="text" value={form.performedBy}
                  onChange={e => setForm(f => ({ ...f, performedBy: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="Staff name or vendor" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 border border-gray-200 rounded-lg py-2 text-sm">Cancel</button>
                <button type="submit" disabled={createMutation.isPending}
                  className="flex-1 bg-brand-600 text-white rounded-lg py-2 text-sm font-semibold disabled:opacity-60">
                  {createMutation.isPending ? 'Saving…' : 'Save Entry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Log list */}
      {!selectedBoat ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 p-12 text-center">
          <p className="text-gray-400">Select a boat above to view its maintenance history.</p>
        </div>
      ) : isLoading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="bg-white rounded-xl border border-gray-200 h-20 animate-pulse" />)}
        </div>
      ) : logs.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 p-12 text-center">
          <p className="text-gray-400">No log entries yet. Add the first one above.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-6 py-3 text-xs text-gray-500 font-medium">Date</th>
                <th className="text-left px-6 py-3 text-xs text-gray-500 font-medium">Type</th>
                <th className="text-left px-6 py-3 text-xs text-gray-500 font-medium">Notes</th>
                <th className="text-left px-6 py-3 text-xs text-gray-500 font-medium">By</th>
                <th className="text-right px-6 py-3 text-xs text-gray-500 font-medium">Cost</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {logs.map(log => {
                const cfg = TYPE_CFG[log.type];
                return (
                  <tr key={log.id}>
                    <td className="px-6 py-4 text-gray-600 whitespace-nowrap">
                      {new Date(log.performedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${cfg.color}`}>{cfg.label}</span>
                    </td>
                    <td className="px-6 py-4 text-gray-700 max-w-xs truncate">{log.notes ?? '—'}</td>
                    <td className="px-6 py-4 text-gray-600">{log.performedBy ?? '—'}</td>
                    <td className="px-6 py-4 text-right text-gray-700">
                      {log.cost != null ? `$${log.cost.toFixed(2)}` : '—'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button onClick={() => { if (confirm('Delete this entry?')) deleteMutation.mutate(log.id); }}
                        className="text-xs text-red-500 hover:underline">Delete</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
