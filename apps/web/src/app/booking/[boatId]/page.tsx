'use client';

import Link from 'next/link';
import { useAuth } from '@clerk/nextjs';
import { useParams, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { addDays, differenceInCalendarDays, format } from 'date-fns';
import { authedRequest, getAddons, getBoat } from '@/lib/api';
import type { Addon, BoatListing } from '@/lib/types';

const WAIVER = `BOAT RENTAL WAIVER AND RELEASE OF LIABILITY

I understand that boating involves inherent risks, including collision, capsizing, injury, and drowning. I voluntarily assume those risks and agree to operate the watercraft responsibly, follow all applicable laws, and comply with marina instructions.

I accept responsibility for damage beyond normal wear and confirm that I am at least 18 years old and legally able to enter this agreement.`;

function BookingContent() {
  const { boatId } = useParams<{ boatId: string }>();
  const searchParams = useSearchParams();
  const { isSignedIn, getToken } = useAuth();
  const [boat, setBoat] = useState<BoatListing | null>(null);
  const [addons, setAddons] = useState<Addon[]>([]);
  const [demo, setDemo] = useState(false);
  const [startDate, setStartDate] = useState(searchParams.get('start') ?? format(addDays(new Date(), 1), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(searchParams.get('end') ?? format(addDays(new Date(), 2), 'yyyy-MM-dd'));
  const [selected, setSelected] = useState<string[]>([]);
  const [signerName, setSignerName] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getBoat(boatId).then(async (result) => {
      setBoat(result.boat);
      setDemo(result.demo);
      setAddons(await getAddons(result.boat.marina.id, result.demo));
    });
  }, [boatId]);

  const days = Math.max(1, differenceInCalendarDays(new Date(endDate), new Date(startDate)) || 1);
  const addonTotal = useMemo(() => selected.reduce((sum, id) => sum + (addons.find((addon) => addon.id === id)?.price ?? 0), 0), [addons, selected]);
  const rental = (boat?.dailyRate ?? 0) * days;
  const fee = Math.round((rental + addonTotal) * 10) / 100;
  const total = rental + addonTotal + fee;

  async function checkout() {
    setError('');
    if (!isSignedIn) return setError('Sign in from the header before completing your reservation.');
    if (!signerName.trim() || !agreed) return setError('Enter your name and accept the waiver to continue.');
    if (demo) return setError('Preview boats cannot be booked. Start the API and add marina inventory to test live checkout.');
    setSubmitting(true);
    try {
      const token = await getToken();
      if (!token) throw new Error('Your session expired. Please sign in again.');
      const reservation = await authedRequest<{ id: string }>('/reservations', token, {
        method: 'POST',
        body: JSON.stringify({ boatId, startDate: new Date(startDate).toISOString(), endDate: new Date(endDate).toISOString(), addonIds: selected, notes }),
      });
      await authedRequest('/reservations/sign-waiver', token, {
        method: 'POST',
        body: JSON.stringify({ reservationId: reservation.id, signerName, agreed: true }),
      });
      const checkoutSession = await authedRequest<{ url: string }>('/payments/checkout', token, {
        method: 'POST',
        body: JSON.stringify({ reservationId: reservation.id }),
      });
      window.location.href = checkoutSession.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Booking failed. Please try again.');
      setSubmitting(false);
    }
  }

  if (!boat) return <div className="empty-state">Preparing your booking...</div>;

  return (
    <main className="booking-page">
      <div className="container booking-shell">
        <div className="booking-header">
          <p className="eyebrow">Almost on the water</p>
          <h1>Complete your reservation</h1>
          <p className="section-copy">Review the details, choose your extras, and check out securely.</p>
        </div>
        {demo && <div className="demo-note">Preview mode is active. The full checkout interface is available, but payment is disabled for sample boats.</div>}
        <div className="booking-layout">
          <div className="booking-main">
            <section className="form-section">
              <h2>1. Rental dates</h2>
              <div className="date-grid">
                <label><span className="field-label">Start date</span><input className="input" type="date" min={format(new Date(), 'yyyy-MM-dd')} value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label>
                <label><span className="field-label">End date</span><input className="input" type="date" min={format(addDays(new Date(startDate), 1), 'yyyy-MM-dd')} value={endDate} onChange={(e) => setEndDate(e.target.value)} /></label>
              </div>
            </section>
            <section className="form-section">
              <h2>2. Make it your day</h2>
              {addons.length === 0 ? <p className="section-copy">This marina has no add-ons listed.</p> : addons.map((addon) => (
                <label className="addon-option" key={addon.id}>
                  <input type="checkbox" checked={selected.includes(addon.id)} onChange={() => setSelected((current) => current.includes(addon.id) ? current.filter((id) => id !== addon.id) : [...current, addon.id])} />
                  <span className="addon-copy"><strong>{addon.name}</strong><span>{addon.description}</span></span>
                  <strong>+${addon.price}</strong>
                </label>
              ))}
            </section>
            <section className="form-section">
              <h2>3. Sign the waiver</h2>
              <div className="waiver-box">{WAIVER}</div>
              <label style={{ display: 'block', marginTop: 14 }}><span className="field-label">Full legal name</span><input className="input" value={signerName} onChange={(e) => setSignerName(e.target.value)} placeholder="Your full name" /></label>
              <label className="check-row"><input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} /><span>I have read and agree to the boat rental waiver and release of liability.</span></label>
            </section>
            <section className="form-section">
              <h2>4. Notes for the marina</h2>
              <textarea className="input" style={{ height: 100, paddingTop: 12, resize: 'vertical' }} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything the marina should know? (optional)" />
            </section>
          </div>
          <aside className="summary-card">
            <img src={boat.photoUrls?.[0]} alt={boat.name} style={{ width: '100%', height: 150, objectFit: 'cover', borderRadius: 10, marginBottom: 16 }} />
            <h2 style={{ margin: '0 0 4px', font: '700 20px Manrope' }}>{boat.name}</h2>
            <p style={{ margin: '0 0 18px', color: 'var(--muted)', fontSize: 13 }}>{boat.marina.name} · {boat.marina.lake}</p>
            <div className="price-lines">
              <div className="price-line"><span>${boat.dailyRate} x {days} days</span><span>${rental.toFixed(2)}</span></div>
              {selected.map((id) => { const addon = addons.find((item) => item.id === id); return addon ? <div className="price-line" key={id}><span>{addon.name}</span><span>${addon.price.toFixed(2)}</span></div> : null; })}
              <div className="price-line"><span>Service fee</span><span>${fee.toFixed(2)}</span></div>
              <div className="price-line total"><span>Total</span><span>${total.toFixed(2)}</span></div>
            </div>
            <button className="button button-coral button-block" onClick={checkout} disabled={submitting}>{submitting ? 'Opening checkout...' : isSignedIn ? 'Confirm and pay' : 'Sign in to reserve'}</button>
            {error && <p className="error-message">{error}</p>}
            <Link href={`/boats/${boat.id}`} style={{ display: 'block', textAlign: 'center', marginTop: 15, color: 'var(--muted)', fontSize: 13 }}>Back to boat details</Link>
          </aside>
        </div>
      </div>
    </main>
  );
}

export default function BookingPage() {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    return (
      <main className="booking-page">
        <div className="container booking-shell">
          <div className="empty-state">
            <h1>Authentication setup required</h1>
            <p>Add `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` to `.env.local` to enable reservations and checkout.</p>
            <Link href="/boats" className="button button-coral">Back to boats</Link>
          </div>
        </div>
      </main>
    );
  }
  return <BookingContent />;
}
