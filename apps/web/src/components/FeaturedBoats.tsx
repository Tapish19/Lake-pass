'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import BoatCard from './BoatCard';
import { ArrowIcon } from './Icons';
import { getBoats } from '@/lib/api';
import type { BoatListing } from '@/lib/types';

export default function FeaturedBoats() {
  const [boats, setBoats] = useState<BoatListing[]>([]);

  useEffect(() => {
    getBoats().then(({ boats: results }) => setBoats(results.slice(0, 3)));
  }, []);

  return (
    <section className="featured">
      <div className="container">
        <div className="section-head-row">
          <div>
            <p className="eyebrow">Ready when you are</p>
            <h2 className="section-heading">Popular boats near the water</h2>
          </div>
          <Link href="/boats" className="link-arrow">Explore all boats <ArrowIcon /></Link>
        </div>
        <div className="boat-grid">
          {boats.map((boat) => <BoatCard key={boat.id} boat={boat} />)}
        </div>
      </div>
    </section>
  );
}
