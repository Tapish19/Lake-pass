'use client';

import { useState, useEffect } from 'react';

interface Boat   { id: string; name: string; type: string; capacity: number; dailyRate: number }
interface Marina { id: string; name: string; widgetColor?: string; widgetFont?: string; logoUrl?: string; boats: Boat[] }

interface Props { params: { marinaId: string } }

export default function WidgetPage({ params }: Props) {
  const [marina, setMarina]             = useState<Marina | null>(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [results, setResults]           = useState<Boat[]>([]);
  const [searched, setSearched]         = useState(false);
  const [loading, setLoading]           = useState(false);
  const [selected, setSelected]         = useState<Boat | null>(null);
  const [done, setDone]                 = useState(false);

  const API   = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';
  const color = marina?.widgetColor ?? '#1d6fdb';
  const font  = marina?.widgetFont  ?? 'system-ui, sans-serif';

  useEffect(() => {
    fetch(`${API}/marinas/${params.marinaId}`)
      .then(r => r.json())
      .then(setMarina)
      .catch(console.error);
  }, [params.marinaId, API]);

  const boatTypes = marina ? [...new Set(marina.boats.map(b => b.type))] : [];

  const handleSearch = async () => {
    setLoading(true);
    const qs = new URLSearchParams({ marinaId: params.marinaId });
    if (selectedDate) qs.set('date', selectedDate);
    if (selectedType) qs.set('type', selectedType);
    const data: Boat[] = await fetch(`${API}/boats?${qs}`).then(r => r.json()).catch(() => []);
    setResults(data);
    setSearched(true);
    setLoading(false);
  };

  const handleBook = () => {
    if (!selected) return;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
    window.open(`${appUrl}/booking/${selected.id}?date=${selectedDate}`, '_blank');
    setDone(true);
  };

  return (
    <div className="max-w-sm mx-auto p-3 font-sans" style={{ fontFamily: font }}>
      <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100">
        {/* Header */}
        <div className="p-4 text-white flex items-center gap-3" style={{ backgroundColor: color }}>
          {marina?.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={marina.logoUrl} alt={marina.name} className="w-8 h-8 rounded-full object-cover bg-white/20" />
          )}
          <div>
            <h2 className="text-base font-bold">{marina?.name ?? 'Book a Boat'}</h2>
            <p className="text-xs opacity-80 mt-0.5">Real-time availability</p>
          </div>
        </div>

        {!selected ? (
          <div className="p-4 space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
              <input type="date" value={selectedDate}
                min={new Date().toISOString().slice(0,10)}
                onChange={e => setSelectedDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Boat Type</label>
              <select value={selectedType} onChange={e => setSelectedType(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                <option value="">Any type</option>
                {boatTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <button onClick={handleSearch} disabled={loading}
              className="w-full text-white rounded-lg py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-60"
              style={{ backgroundColor: color }}>
              {loading ? 'Searching…' : 'Check Availability'}
            </button>

            {searched && (
              <div className="mt-1 space-y-2">
                {results.length === 0 ? (
                  <p className="text-sm text-center text-gray-400 py-4">No boats available for those criteria.</p>
                ) : results.map(boat => (
                  <button key={boat.id} onClick={() => setSelected(boat)}
                    className="w-full text-left border border-gray-100 rounded-xl p-3 hover:border-gray-300 transition-colors">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-semibold text-gray-900 text-sm">{boat.name}</p>
                        <p className="text-xs text-gray-500">{boat.type} · {boat.capacity} guests</p>
                      </div>
                      <p className="font-bold text-gray-900 text-sm">${boat.dailyRate}/day</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : done ? (
          <div className="p-6 text-center">
            <div className="text-4xl mb-2">✓</div>
            <p className="font-semibold text-gray-900">Redirected to booking!</p>
            <p className="text-xs text-gray-500 mt-1">Complete your reservation in the app.</p>
            <button onClick={() => { setSelected(null); setDone(false); setSearched(false); }}
              className="mt-4 text-xs text-gray-500 underline">Start over</button>
          </div>
        ) : (
          <div className="p-4">
            <button onClick={() => setSelected(null)} className="text-xs text-gray-500 mb-3 hover:underline">← Back</button>
            <h3 className="font-semibold text-gray-900 mb-0.5">{selected.name}</h3>
            <p className="text-xs text-gray-500 mb-3">{selected.type} · {selected.capacity} guests</p>

            <div className="bg-gray-50 rounded-lg p-3 mb-3 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Date</span>
                <span className="font-medium text-gray-900">{selectedDate || 'Not selected'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Daily rate</span>
                <span className="font-medium text-gray-900">${selected.dailyRate}</span>
              </div>
            </div>

            <button onClick={handleBook}
              className="w-full text-white rounded-lg py-2.5 text-sm font-semibold hover:opacity-90"
              style={{ backgroundColor: color }}>
              Book Now →
            </button>
          </div>
        )}

        <div className="border-t border-gray-100 p-3 text-center">
          <span className="text-xs text-gray-400">Powered by </span>
          <span className="text-xs font-semibold" style={{ color }}>Lake Pass</span>
        </div>
      </div>
    </div>
  );
}

