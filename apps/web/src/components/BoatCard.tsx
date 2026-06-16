import Link from 'next/link';
import type { BoatListing } from '@/lib/types';
import { MapPinIcon, StarIcon, UsersIcon } from './Icons';

export default function BoatCard({ boat, query = '' }: { boat: BoatListing; query?: string }) {
  const href = `/boats/${boat.id}${query ? `?${query}` : ''}`;
  return (
    <article className="boat-card">
      <Link href={href} className="boat-image-wrap">
        <img src={boat.photoUrls?.[0]} alt={boat.name} className="boat-image" />
        <span className="boat-type">{boat.type}</span>
      </Link>
      <div className="boat-card-body">
        <div className="boat-card-topline">
          <h3><Link href={href}>{boat.name}</Link></h3>
          {boat.rating != null && <span className="rating"><StarIcon /> {boat.rating}</span>}
        </div>
        <p className="boat-location"><MapPinIcon /> {boat.marina.lake} · {boat.marina.name}</p>
        <div className="boat-card-footer">
          <span className="capacity"><UsersIcon /> Up to {boat.capacity}</span>
          <span className="price"><strong>${boat.dailyRate}</strong> / day</span>
        </div>
      </div>
    </article>
  );
}
