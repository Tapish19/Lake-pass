'use client';

import { SignedIn, SignedOut, SignInButton, useAuth } from '@clerk/nextjs';
import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { getTrips } from '@/lib/api';
import type { Reservation } from '@/lib/types';

const WEATHER_API_KEY = process.env.NEXT_PUBLIC_OPENWEATHER_KEY ?? '';

interface WeatherData {
  temp:    number;
  desc:    string;
  icon:    string;
  wind:    number;
  humidity: number;
}

async function fetchWeather(lat: number, lon: number): Promise<WeatherData | null> {
  if (!WEATHER_API_KEY) return null;
  try {
    const res  = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${WEATHER_API_KEY}&units=imperial`
    );
    const data = await res.json();
    return {
      temp:     Math.round(data.main.temp),
      desc:     data.weather[0].description,
      icon:     `https://openweathermap.org/img/wn/${data.weather[0].icon}@2x.png`,
      wind:     Math.round(data.wind.speed),
      humidity: data.main.humidity,
    };
  } catch {
    return null;
  }
}

function MapsLink({ marina }: { marina: { name: string; address?: string; city?: string; state?: string; latitude?: number; longitude?: number } }) {
  const query = marina.latitude && marina.longitude
    ? `${marina.latitude},${marina.longitude}`
    : encodeURIComponent(`${marina.name} ${marina.address ?? ''} ${marina.city ?? ''} ${marina.state ?? ''}`.trim());
  const href = `https://www.google.com/maps/dir/?api=1&destination=${query}`;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 text-sm text-brand-600 hover:underline mt-2">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
        <circle cx="12" cy="9" r="2.5"/>
      </svg>
      Get directions
    </a>
  );
}

function WeatherCard({ lat, lon }: { lat: number; lon: number }) {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWeather(lat, lon).then(w => { setWeather(w); setLoading(false); });
  }, [lat, lon]);

  if (!WEATHER_API_KEY) return null;
  if (loading) return <p className="text-xs text-gray-400 mt-2">Loading weather…</p>;
  if (!weather) return null;

  return (
    <div className="flex items-center gap-3 mt-3 bg-blue-50 rounded-xl px-4 py-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={weather.icon} alt={weather.desc} className="w-10 h-10" />
      <div>
        <p className="text-sm font-semibold text-gray-900">{weather.temp}°F · {weather.desc}</p>
        <p className="text-xs text-gray-500">Wind {weather.wind} mph · Humidity {weather.humidity}%</p>
      </div>
    </div>
  );
}

const STATUS_COLORS: Record<string, string> = {
  confirmed:    'bg-green-100 text-green-700',
  pending:      'bg-yellow-100 text-yellow-700',
  checked_in:   'bg-blue-100 text-blue-700',
  checked_out:  'bg-gray-100 text-gray-600',
  cancelled:    'bg-red-100 text-red-700',
  no_show:      'bg-red-100 text-red-700',
};

function TripContent() {
  const { getToken } = useAuth();
  const [trips, setTrips]   = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState('');

  useEffect(() => {
    getToken()
      .then(token => token ? getTrips(token) : [])
      .then(setTrips)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [getToken]);

  if (loading) return <div className="empty-state">Finding your trips...</div>;
  if (error)   return <div className="empty-state">{error}</div>;
  if (!trips.length) return (
    <div className="empty-state">
      <h2>No trips booked yet</h2>
      <p>Your future lake days will appear here.</p>
    </div>
  );

  const upcoming = trips.filter(t => !['cancelled','checked_out'].includes(t.status));
  const past     = trips.filter(t =>  ['cancelled','checked_out'].includes(t.status));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {upcoming.length > 0 && (
        <section>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1rem', color: '#111' }}>Upcoming</h2>
          <div className="trip-list">
            {upcoming.map(trip => (
              <article className="trip-card" key={trip.id} style={{ display: 'block', padding: '1.5rem' }}>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                  {trip.boat.photoUrls?.[0] && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={trip.boat.photoUrls[0]} alt={trip.boat.name}
                      style={{ width: 100, height: 80, objectFit: 'cover', borderRadius: 10, flexShrink: 0 }} />
                  )}
                  <div style={{ flex: 1 }}>
                    <span className={`status-pill ${STATUS_COLORS[trip.status] ?? ''}`} style={{ textTransform: 'capitalize' }}>
                      {trip.status.replace('_', ' ')}
                    </span>
                    <h2 style={{ fontSize: '1.1rem', margin: '6px 0 2px' }}>{trip.boat.name}</h2>
                    <p className="section-copy" style={{ margin: 0 }}>
                      {trip.boat.marina.name} · {format(new Date(trip.startDate), 'MMM d')} – {format(new Date(trip.endDate), 'MMM d, yyyy')}
                    </p>
                    <strong style={{ display: 'block', marginTop: 4 }}>
                      ${trip.totalAmount?.toFixed(2) ?? 'Pending'}
                    </strong>

                    {/* Directions */}
                    <MapsLink marina={trip.boat.marina as any} />

                    {/* Marina contact */}
                    {(trip.boat.marina as any).phone && (
                      <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
                        📞 <a href={`tel:${(trip.boat.marina as any).phone}`} style={{ color: 'inherit' }}>
                          {(trip.boat.marina as any).phone}
                        </a>
                      </p>
                    )}

                    {/* Weather at marina location (if lat/lon available) */}
                    {(trip.boat.marina as any).latitude && (trip.boat.marina as any).longitude && (
                      <WeatherCard
                        lat={(trip.boat.marina as any).latitude}
                        lon={(trip.boat.marina as any).longitude}
                      />
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {past.length > 0 && (
        <section>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1rem', color: '#111' }}>Past trips</h2>
          <div className="trip-list">
            {past.map(trip => (
              <article className="trip-card" key={trip.id}>
                {trip.boat.photoUrls?.[0] && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={trip.boat.photoUrls[0]} alt={trip.boat.name} />
                )}
                <div>
                  <span className={`status-pill ${STATUS_COLORS[trip.status] ?? ''}`} style={{ textTransform: 'capitalize' }}>
                    {trip.status.replace('_', ' ')}
                  </span>
                  <h2>{trip.boat.name}</h2>
                  <p className="section-copy">
                    {trip.boat.marina.name} · {format(new Date(trip.startDate), 'MMM d')} to {format(new Date(trip.endDate), 'MMM d, yyyy')}
                  </p>
                </div>
                <strong>${trip.totalAmount?.toFixed(2) ?? 'Pending'}</strong>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export default function TripsPage() {
  const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

  return (
    <main>
      <section className="page-hero">
        <div className="container">
          <p className="eyebrow">Your time on the water</p>
          <h1>My trips</h1>
          <p>Everything you need before you head to the marina.</p>
        </div>
      </section>
      <div className="container">
        {!clerkEnabled ? (
          <div className="empty-state">
            <h2>Authentication setup required</h2>
            <p>Add your Clerk publishable key to enable customer accounts and trip history.</p>
          </div>
        ) : (
          <>
            <SignedOut>
              <div className="empty-state">
                <h2>Sign in to see your trips</h2>
                <SignInButton mode="modal">
                  <button className="button button-coral">Sign in</button>
                </SignInButton>
              </div>
            </SignedOut>
            <SignedIn><TripContent /></SignedIn>
          </>
        )}
      </div>
    </main>
  );
}
