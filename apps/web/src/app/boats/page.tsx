'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import BoatCard from '@/components/BoatCard';
import { SearchIcon } from '@/components/Icons';
import { getBoats } from '@/lib/api';
import type { BoatListing } from '@/lib/types';

function BoatsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [boats, setBoats] = useState<BoatListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [demo, setDemo] = useState(false);
  const [lake, setLake] = useState(searchParams.get('lake') ?? '');
  const [date, setDate] = useState(searchParams.get('date') ?? '');
  const [guests, setGuests] = useState(searchParams.get('guests') ?? '');
  const [type, setType] = useState(searchParams.get('type') ?? '');

  const query = searchParams.toString();

  useEffect(() => {
    setLoading(true);
    const apiParams = new URLSearchParams();
    if (searchParams.get('date')) apiParams.set('date', searchParams.get('date')!);
    if (searchParams.get('guests')) apiParams.set('guests', searchParams.get('guests')!);
    if (searchParams.get('type')) apiParams.set('type', searchParams.get('type')!);
    getBoats(apiParams.toString()).then((result) => {
      setBoats(result.boats);
      setDemo(result.demo);
      setLoading(false);
    });
  }, [query, searchParams]);

  const visibleBoats = useMemo(() => boats.filter((boat) => !lake || boat.marina.lake.toLowerCase().includes(lake.toLowerCase())), [boats, lake]);

  function applyFilters(event: React.FormEvent) {
    event.preventDefault();
    const params = new URLSearchParams();
    if (lake) params.set('lake', lake);
    if (date) params.set('date', date);
    if (guests) params.set('guests', guests);
    if (type) params.set('type', type);
    router.push(`/boats?${params}`);
  }

  return (
    <main>
      <section className="page-hero">
        <div className="container">
          <p className="eyebrow">Choose your adventure</p>
          <h1>Find the right boat</h1>
          <p>Live availability from marinas that know their water.</p>
        </div>
      </section>
      <div className="filter-bar">
        <form className="container filter-form" onSubmit={applyFilters}>
          <select className="input" value={lake} onChange={(e) => setLake(e.target.value)}>
            <option value="">All lakes</option>
            <option>Table Rock Lake</option><option>Lake of the Ozarks</option><option>Lake Murray</option><option>Lake Taneycomo</option>
          </select>
          <input className="input" type="date" min={new Date().toISOString().slice(0, 10)} value={date} onChange={(e) => setDate(e.target.value)} />
          <input className="input" type="number" min="1" max="20" placeholder="Guests" value={guests} onChange={(e) => setGuests(e.target.value)} />
          <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">Any boat type</option><option>Pontoon</option><option>Ski Boat</option><option>Deck Boat</option><option>Fishing</option><option>Jet Ski</option>
          </select>
          <button className="button button-small" type="submit"><SearchIcon /> Update</button>
        </form>
      </div>
      <section className="listing-section">
        <div className="container">
          {demo && <div className="demo-note">Preview inventory is showing because the API is not connected. Live boats will appear here automatically when the backend is running.</div>}
          <div className="listing-meta">
            <strong>{loading ? 'Checking the docks...' : `${visibleBoats.length} boat${visibleBoats.length === 1 ? '' : 's'} available`}</strong>
            <span>Sorted by daily price</span>
          </div>
          {!loading && visibleBoats.length === 0 ? <div className="empty-state">No boats match those filters. Try another date or a larger search area.</div> : (
            <div className="boat-grid">{visibleBoats.map((boat) => <BoatCard key={boat.id} boat={boat} query={query} />)}</div>
          )}
        </div>
      </section>
    </main>
  );
}

export default function BoatsPage() {
  return <Suspense fallback={<div className="empty-state">Loading boats...</div>}><BoatsContent /></Suspense>;
}
