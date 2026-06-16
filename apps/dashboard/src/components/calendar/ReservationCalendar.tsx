'use client';

import { useQuery } from '@tanstack/react-query';
import { Calendar, dateFnsLocalizer, View } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { enUS } from 'date-fns/locale/en-US';
import { useState, useMemo } from 'react';
import { useApi } from '@/lib/useApi';

import 'react-big-calendar/lib/css/react-big-calendar.css';

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 0 }),
  getDay,
  locales: { 'en-US': enUS },
});

const STATUS_COLORS: Record<string, string> = {
  pending:     '#f59e0b',
  confirmed:   '#3b82f6',
  checked_in:  '#10b981',
  checked_out: '#6b7280',
  cancelled:   '#ef4444',
  no_show:     '#9ca3af',
};

interface Reservation {
  id: string;
  startDate: string;
  endDate: string;
  status: string;
  boat?: { name: string };
  user?: { name: string };
}

export default function ReservationCalendar() {
  const api = useApi();
  const [view, setView]   = useState<View>('month');
  const [date, setDate]   = useState(new Date());

  const { data: reservations = [], isLoading } = useQuery<Reservation[]>({
    queryKey: ['marina-reservations'],
    queryFn:  () => api.get('/reservations/marina').then(r => r.data),
  });

  const events = useMemo(() =>
    reservations
      .filter(r => r.status !== 'cancelled')
      .map(r => ({
        id:       r.id,
        title:    `${r.boat?.name ?? '—'} · ${r.user?.name ?? '—'}`,
        start:    new Date(r.startDate),
        end:      new Date(r.endDate),
        resource: r,
      })),
    [reservations],
  );

  const eventStyleGetter = (event: any) => ({
    style: {
      backgroundColor: STATUS_COLORS[event.resource.status] ?? '#3b82f6',
      borderRadius:    '6px',
      border:          'none',
      color:           '#fff',
      fontSize:        '12px',
      padding:         '2px 6px',
    },
  });

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      {/* Legend */}
      <div className="flex flex-wrap gap-3 mb-3">
        {Object.entries(STATUS_COLORS).map(([status, color]) => (
          <span key={status} className="flex items-center gap-1.5 text-xs text-gray-600 capitalize">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
            {status.replace('_', ' ')}
          </span>
        ))}
      </div>

      {isLoading ? (
        <div className="h-[460px] flex items-center justify-center text-gray-400 text-sm">Loading…</div>
      ) : (
        <Calendar
          localizer={localizer}
          events={events}
          startAccessor="start"
          endAccessor="end"
          style={{ height: 460 }}
          view={view}
          onView={setView}
          date={date}
          onNavigate={setDate}
          eventPropGetter={eventStyleGetter}
          popup
          tooltipAccessor={(e: any) => `${e.title} (${e.resource.status})`}
        />
      )}
    </div>
  );
}
