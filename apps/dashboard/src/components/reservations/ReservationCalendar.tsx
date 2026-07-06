'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Calendar, dateFnsLocalizer, View, SlotInfo } from 'react-big-calendar';
import  withDragAndDrop from 'react-big-calendar/lib/addons/dragAndDrop';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { enUS } from 'date-fns/locale/en-US';
import { useState, useMemo } from 'react';
import { useApi } from '@/lib/useApi';
import type { Boat } from '@lake-pass/shared';

import 'react-big-calendar/lib/css/react-big-calendar.css';
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css';

const DnDCalendar = withDragAndDrop(Calendar as any);

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
  blockout:    '#e5e7eb',
};

interface Reservation {
  id: string;
  startDate: string;
  endDate: string;
  status: string;
  boat?: { id: string; name: string };
  user?: { name: string };
  walkInName?: string;
}

interface BlockoutModal {
  start: Date;
  end: Date;
}

function BlockoutCreateModal({
  slot,
  boats,
  onConfirm,
  onClose,
}: {
  slot: BlockoutModal;
  boats: Boat[];
  onConfirm: (boatId: string, reason: string) => void;
  onClose: () => void;
}) {
  const [boatId, setBoatId] = useState('');
  const [reason, setReason] = useState('');

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-semibold mb-1">Block Dates</h3>
        <p className="text-sm text-gray-500 mb-4">
          {slot.start.toLocaleDateString()} → {slot.end.toLocaleDateString()}
        </p>

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Boat</label>
            <select value={boatId} onChange={e => setBoatId(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
              <option value="">Select a boat…</option>
              {boats.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reason (optional)</label>
            <input
              type="text"
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. Engine maintenance"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="flex gap-3 mt-4">
          <button onClick={onClose} className="flex-1 border border-gray-200 rounded-lg py-2 text-sm">Cancel</button>
          <button
            onClick={() => boatId && onConfirm(boatId, reason)}
            disabled={!boatId}
            className="flex-1 bg-brand-600 text-white rounded-lg py-2 text-sm font-semibold disabled:opacity-50"
          >
            Block Dates
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ReservationCalendar() {
  const api         = useApi();
  const queryClient = useQueryClient();
  const [view, setView] = useState<View>('month');
  const [date, setDate] = useState(new Date());
  const [pendingSlot, setPendingSlot] = useState<BlockoutModal | null>(null);

  const { data: reservations = [], isLoading } = useQuery<Reservation[]>({
    queryKey: ['marina-reservations'],
    queryFn:  () => api.get('/reservations/marina').then(r => r.data),
  });

  const { data: boats = [] } = useQuery<Boat[]>({
    queryKey: ['boats', 'mine'],
    queryFn:  () => api.get('/boats/mine').then(r => r.data),
  });

  const blockoutMutation = useMutation({
    mutationFn: ({ boatId, start, end, reason }: { boatId: string; start: Date; end: Date; reason: string }) =>
      api.post(`/boats/${boatId}/blockouts`, {
        startDate: start.toISOString(),
        endDate:   end.toISOString(),
        reason:    reason || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marina-reservations'] });
      queryClient.invalidateQueries({ queryKey: ['boats'] });
      setPendingSlot(null);
    },
  });

  const rescheduleMutation = useMutation({
    mutationFn: ({ id, start, end }: { id: string; start: Date; end: Date }) =>
      api.patch(`/reservations/${id}/reschedule`, { startDate: start.toISOString(), endDate: end.toISOString() }),
    onMutate: async ({ id, start, end }) => {
      await queryClient.cancelQueries({ queryKey: ['marina-reservations'] });
      const previous = queryClient.getQueryData<Reservation[]>(['marina-reservations']);
      queryClient.setQueryData<Reservation[]>(['marina-reservations'], old =>
        old?.map(r => r.id === id ? { ...r, startDate: start.toISOString(), endDate: end.toISOString() } : r));
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(['marina-reservations'], context.previous);
      window.alert('Could not reschedule — the new time may conflict with another booking or the turnaround buffer.');
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['marina-reservations'] }),
  });

  const events = useMemo(() =>
    reservations
      .filter(r => r.status !== 'cancelled')
      .map(r => ({
        id:       r.id,
        title:    r.boat ? `${r.boat.name} · ${r.walkInName ?? r.user?.name ?? '—'}` : '—',
        start:    new Date(r.startDate),
        end:      new Date(r.endDate),
        resource: r,
        type:     'reservation',
      })),
    [reservations],
  );

  // Handle drag-select on the calendar to create a blockout
  const handleSelectSlot = (slotInfo: SlotInfo) => {
    setPendingSlot({ start: slotInfo.start, end: slotInfo.end });
  };

  const handleConfirmBlockout = (boatId: string, reason: string) => {
    if (!pendingSlot) return;
    blockoutMutation.mutate({ boatId, start: pendingSlot.start, end: pendingSlot.end, reason });
  };

  // Drag an existing reservation event to a new date/time, or resize its edge
  const handleEventDrop = ({ event, start, end }: { event: any; start: Date; end: Date }) => {
    if (event.type === 'blockout') return; // blockouts aren't reservations — ignore
    rescheduleMutation.mutate({ id: event.id, start, end });
  };
  const handleEventResize = handleEventDrop;

  const eventStyleGetter = (event: any) => ({
    style: {
      backgroundColor: event.type === 'blockout'
        ? STATUS_COLORS.blockout
        : (STATUS_COLORS[event.resource?.status] ?? '#3b82f6'),
      borderRadius: '6px',
      border:       'none',
      color:        event.type === 'blockout' ? '#374151' : '#fff',
      fontSize:     '12px',
      padding:      '2px 6px',
    },
  });

  return (
    <>
      {pendingSlot && (
        <BlockoutCreateModal
          slot={pendingSlot}
          boats={boats}
          onConfirm={handleConfirmBlockout}
          onClose={() => setPendingSlot(null)}
        />
      )}

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

        <p className="text-xs text-gray-400 mb-3">
          Tip: drag-select empty dates to create a maintenance blockout, or drag an existing booking to reschedule it.
        </p>

        {isLoading ? (
          <div className="h-[460px] flex items-center justify-center text-gray-400 text-sm">Loading…</div>
        ) : (
          <DnDCalendar
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
            selectable
            resizable
            draggableAccessor={(e: any) => e.type !== 'blockout'}
            onSelectSlot={handleSelectSlot}
            onEventDrop={handleEventDrop}
            onEventResize={handleEventResize}
            popup
            tooltipAccessor={(e: any) => e.type === 'blockout'
              ? `Blockout: ${e.title}`
              : `${e.title} (${e.resource?.status}) — drag to reschedule`
            }
          />
        )}
      </div>
    </>
  );
}
