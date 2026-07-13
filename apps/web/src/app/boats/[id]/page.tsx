import { Suspense } from 'react';
import BoatDetailClient from './BoatDetailClient';

export default function BoatDetailRoute() {
  return (
    <Suspense fallback={<div className="empty-state">Loading this boat...</div>}>
      <BoatDetailClient />
    </Suspense>
  );
}
