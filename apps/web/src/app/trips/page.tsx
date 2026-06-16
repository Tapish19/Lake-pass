'use client';

import { SignedIn, SignedOut, SignInButton, useAuth } from '@clerk/nextjs';
import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { getTrips } from '@/lib/api';
import type { Reservation } from '@/lib/types';

function TripContent() {
  const { getToken } = useAuth();
  const [trips, setTrips] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getToken().then((token) => token ? getTrips(token) : []).then(setTrips).catch((err) => setError(err.message)).finally(() => setLoading(false));
  }, [getToken]);

  if (loading) return <div className="empty-state">Finding your trips...</div>;
  if (error) return <div className="empty-state">{error}</div>;
  if (!trips.length) return <div className="empty-state"><h2>No trips booked yet</h2><p>Your future lake days will appear here.</p></div>;

  return (
    <div className="trip-list">
      {trips.map((trip) => (
        <article className="trip-card" key={trip.id}>
          <img src={trip.boat.photoUrls?.[0]} alt={trip.boat.name} />
          <div>
            <span className="status-pill">{trip.status.replace('_', ' ')}</span>
            <h2>{trip.boat.name}</h2>
            <p className="section-copy">{trip.boat.marina.name} · {format(new Date(trip.startDate), 'MMM d')} to {format(new Date(trip.endDate), 'MMM d, yyyy')}</p>
          </div>
          <strong>${trip.totalAmount?.toFixed(2) ?? 'Pending'}</strong>
        </article>
      ))}
    </div>
  );
}

export default function TripsPage() {
  const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

  return (
    <main>
      <section className="page-hero"><div className="container"><p className="eyebrow">Your time on the water</p><h1>My trips</h1><p>Everything you need before you head to the marina.</p></div></section>
      <div className="container">
        {!clerkEnabled ? (
          <div className="empty-state"><h2>Authentication setup required</h2><p>Add your Clerk publishable key to enable customer accounts and trip history.</p></div>
        ) : (
          <>
            <SignedOut><div className="empty-state"><h2>Sign in to see your trips</h2><SignInButton mode="modal"><button className="button button-coral">Sign in</button></SignInButton></div></SignedOut>
            <SignedIn><TripContent /></SignedIn>
          </>
        )}
      </div>
    </main>
  );
}
