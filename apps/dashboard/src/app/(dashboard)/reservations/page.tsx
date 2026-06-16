'use client';

import { useState } from 'react';
import ReservationCalendar from '@/components/calendar/ReservationCalendar';
import ReservationList     from '@/components/calendar/ReservationList';
import WalkInModal         from '@/components/reservations/WalkInModal';

export default function ReservationsPage() {
  const [showWalkIn, setShowWalkIn] = useState(false);

  return (
    <div>
      {showWalkIn && <WalkInModal onClose={() => setShowWalkIn(false)} />}

      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reservations</h1>
          <p className="text-gray-500">Manage bookings, check-ins, and availability</p>
        </div>
        <button onClick={() => setShowWalkIn(true)}
          className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-brand-700 transition-colors">
          + Walk-in / Phone Booking
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2">
          <ReservationCalendar />
        </div>
        <div className="flex flex-col gap-4">
          <ReservationList />
        </div>
      </div>
    </div>
  );
}
