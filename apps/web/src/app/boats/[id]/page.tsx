'use client';

import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { addDays, differenceInCalendarDays, format } from 'date-fns';
import { ArrowIcon, CheckIcon, MapPinIcon, StarIcon, UsersIcon } from '@/components/Icons';
import { getBoat } from '@/lib/api';
import type { BoatListing } from '@/lib/types';

export default function BoatDetailPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const [boat, setBoat] = useState<BoatListing | null>(null);
  const [demo, setDemo] = useState(false);
  const [startDate, setStartDate] = useState(searchParams.get('date') ?? format(addDays(new Date(), 1), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(addDays(new Date(startDate || new Date()), 1), 'yyyy-MM-dd'));

  useEffect(() => {
    getBoat(id).then((result) => { setBoat(result.boat); setDemo(result.demo); });
  }, [id]);

  const days = useMemo(() => {
    const value = differenceInCalendarDays(new Date(endDate), new Date(startDate));
    return Number.isFinite(value) ? Math.max(1, value) : 1;
  }, [endDate, startDate]);

  if (!boat) return <div className="empty-state">Loading this boat...</div>;
  const rating = boat.rating ?? (boat.reviews?.length ? boat.reviews.reduce((sum, review) => sum + review.rating, 0) / boat.reviews.length : null);
  const bookingQuery = new URLSearchParams({ start: startDate, end: endDate });

  return (
    <main className="detail-page">
      <div className="container">
        <Link href="/boats" className="back-link"><ArrowIcon /> Back to boats</Link>
        {demo && <div className="demo-note">This is preview inventory. Connect the API to reserve live marina boats.</div>}
        <div className="detail-gallery">
          <img src={boat.photoUrls?.[0]} alt={boat.name} />
          <div className="gallery-side">
            {boat.photoUrls?.[1] ? <img src={boat.photoUrls[1]} alt={`${boat.name} detail`} /> : <div className="gallery-placeholder">Lake ready</div>}
            {boat.photoUrls?.[2] ? <img src={boat.photoUrls[2]} alt={`${boat.name} interior`} /> : <div className="gallery-placeholder">Local marina</div>}
          </div>
        </div>
        <div className="detail-layout">
          <div>
            <div className="detail-title-row">
              <div>
                <p className="eyebrow">{boat.type}</p>
                <h1>{boat.name}</h1>
                <p className="detail-meta"><MapPinIcon style={{ width: 15, display: 'inline' }} /> {boat.marina.name}, {boat.marina.lake} · <UsersIcon style={{ width: 15, display: 'inline' }} /> Up to {boat.capacity} guests</p>
              </div>
              {rating && <span className="rating"><StarIcon /> {rating.toFixed(1)} ({boat.reviewCount ?? boat.reviews?.length ?? 0})</span>}
            </div>
            <section className="detail-section">
              <h2>About this boat</h2>
              <p>{boat.description ?? 'A well-maintained boat from a trusted local marina, ready for your next day on the water.'}</p>
            </section>
            <section className="detail-section">
              <h2>What&apos;s included</h2>
              <div className="amenity-grid">
                {(boat.amenities?.length ? boat.amenities : ['Life jackets', 'Safety briefing', 'Marina orientation']).map((item) => <span className="amenity" key={item}><CheckIcon /> {item}</span>)}
              </div>
            </section>
            <section className="detail-section">
              <h2>Guest reviews</h2>
              {boat.reviews?.length ? boat.reviews.map((review) => (
                <div className="review" key={review.id}>
                  <div className="review-head"><span>{review.user?.name ?? 'Lake Pass guest'}</span><span className="rating"><StarIcon /> {review.rating}</span></div>
                  {review.comment && <p>{review.comment}</p>}
                </div>
              )) : <p>No reviews yet. This boat is ready for its first Lake Pass story.</p>}
            </section>
          </div>
          <aside className="booking-card">
            <div className="booking-card-price"><strong>${boat.dailyRate}</strong> / day</div>
            <div className="date-grid">
              <label><span className="field-label">Start date</span><input className="input" type="date" min={format(new Date(), 'yyyy-MM-dd')} value={startDate} onChange={(e) => { setStartDate(e.target.value); setEndDate(format(addDays(new Date(e.target.value), 1), 'yyyy-MM-dd')); }} /></label>
              <label><span className="field-label">End date</span><input className="input" type="date" min={format(addDays(new Date(startDate), 1), 'yyyy-MM-dd')} value={endDate} onChange={(e) => setEndDate(e.target.value)} /></label>
            </div>
            <div className="price-lines">
              <div className="price-line"><span>${boat.dailyRate} x {days} day{days > 1 ? 's' : ''}</span><span>${(boat.dailyRate * days).toFixed(2)}</span></div>
              <div className="price-line"><span>Service fee</span><span>Calculated next</span></div>
            </div>
            <Link href={`/booking/${boat.id}?${bookingQuery}`} className="button button-coral button-block">Reserve this boat <ArrowIcon /></Link>
            <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--muted)', marginBottom: 0 }}>You won&apos;t be charged until checkout.</p>
          </aside>
        </div>
      </div>
    </main>
  );
}
