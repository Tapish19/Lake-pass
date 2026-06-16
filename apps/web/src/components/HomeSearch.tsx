'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CalendarIcon, MapPinIcon, SearchIcon, UsersIcon } from './Icons';

export default function HomeSearch() {
  const router = useRouter();
  const [lake, setLake] = useState('');
  const [date, setDate] = useState('');
  const [guests, setGuests] = useState('2');

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const params = new URLSearchParams();
    if (lake) params.set('lake', lake);
    if (date) params.set('date', date);
    if (guests) params.set('guests', guests);
    router.push(`/boats?${params}`);
  }

  return (
    <form className="search-form" onSubmit={submit}>
      <div className="search-field">
        <label htmlFor="home-lake">Where</label>
        <div className="search-control">
          <MapPinIcon />
          <select id="home-lake" value={lake} onChange={(e) => setLake(e.target.value)}>
            <option value="">Any lake or marina</option>
            <option>Table Rock Lake</option>
            <option>Lake of the Ozarks</option>
            <option>Lake Murray</option>
            <option>Lake Taneycomo</option>
          </select>
        </div>
      </div>
      <div className="search-field">
        <label htmlFor="home-date">Date</label>
        <div className="search-control">
          <CalendarIcon />
          <input id="home-date" type="date" min={new Date().toISOString().slice(0, 10)} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>
      <div className="search-field">
        <label htmlFor="home-guests">Guests</label>
        <div className="search-control">
          <UsersIcon />
          <select id="home-guests" value={guests} onChange={(e) => setGuests(e.target.value)}>
            {[1, 2, 3, 4, 5, 6, 8, 10, 12].map((count) => <option key={count} value={count}>{count} {count === 1 ? 'guest' : 'guests'}</option>)}
          </select>
        </div>
      </div>
      <button className="button button-coral" type="submit"><SearchIcon /> Search boats</button>
    </form>
  );
}
