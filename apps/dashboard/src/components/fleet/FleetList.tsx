'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import type { Boat } from '@lake-pass/shared';
import { useApi } from '@/lib/useApi';

const STATUS_CFG = {
  available:   { label: 'Available',   cls: 'bg-green-100 text-green-700'  },
  booked:      { label: 'Booked',      cls: 'bg-blue-100 text-blue-700'    },
  maintenance: { label: 'Maintenance', cls: 'bg-amber-100 text-amber-700'  },
} as const;

interface EditForm {
  name: string; type: string; capacity: number; dailyRate: number;
  hourlyRate?: number; description?: string; amenities: string;
}

function EditModal({ boat, onClose }: { boat: Boat; onClose: () => void }) {
  const api         = useApi();
  const queryClient = useQueryClient();
  const [photoUrls, setPhotoUrls] = useState<string[]>(boat.photoUrls ?? []);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { register, handleSubmit, formState: { errors } } = useForm<EditForm>({
    defaultValues: {
      name:        boat.name,
      type:        boat.type,
      capacity:    boat.capacity,
      dailyRate:   boat.dailyRate,
      hourlyRate:  boat.hourlyRate ?? undefined,
      description: boat.description ?? '',
      amenities:   (boat.amenities ?? []).join(', '),
    },
  });

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploading(true);
    for (const file of files) {
      try {
        const { data } = await api.post('/uploads/presign', { category: 'boat-photos', mimeType: file.type });
        await fetch(data.uploadUrl, {
          method: 'PUT',
          body: file,
          headers: {
            'Content-Type': file.type,
            // Required by the presign URL: enforce server-side encryption
            'x-amz-server-side-encryption': 'AES256',
          },
        });
        setPhotoUrls(prev => [...prev, data.publicUrl]);
      } catch { /* ignore individual failures */ }
    }
    setUploading(false);
  };

  const saveMutation = useMutation({
    mutationFn: (d: EditForm) => api.patch(`/boats/${boat.id}`, {
      name: d.name, type: d.type, capacity: Number(d.capacity),
      dailyRate: Number(d.dailyRate),
      hourlyRate: d.hourlyRate ? Number(d.hourlyRate) : undefined,
      description: d.description,
      amenities: d.amenities ? d.amenities.split(',').map(s => s.trim()).filter(Boolean) : [],
      photoUrls,
    }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['boats'] }); onClose(); },
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-4">Edit {boat.name}</h2>
        <form onSubmit={handleSubmit(d => saveMutation.mutate(d))} className="space-y-4">
          {([
            ['name','Boat Name','text','e.g. Sunset Cruiser',true],
            ['type','Boat Type','text','Pontoon / Ski / Fishing',true],
            ['capacity','Guest Capacity','number','8',true],
            ['dailyRate','Daily Rate ($)','number','350',true],
            ['hourlyRate','Hourly Rate ($)','number','75 (optional)',false],
            ['amenities','Amenities (comma-separated)','text','Tubes, Cooler',false],
          ] as [keyof EditForm, string, string, string, boolean][]).map(([name, label, type, ph, req]) => (
            <div key={name}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
              <input type={type} placeholder={ph} step={type === 'number' ? 'any' : undefined}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                {...register(name, { required: req ? `${label} is required` : false,
                  ...(type === 'number' ? { valueAsNumber: true } : {}) })} />
              {errors[name] && <p className="text-xs text-red-500 mt-1">{errors[name]?.message}</p>}
            </div>
          ))}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea rows={3} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" {...register('description')} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Photos</label>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={handlePhoto} />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
              className="w-full border-2 border-dashed border-gray-200 rounded-lg p-3 text-sm text-gray-500 hover:border-brand-400 disabled:opacity-60">
              {uploading ? 'Uploading…' : '+ Add more photos'}
            </button>
            {photoUrls.length > 0 && (
              <div className="flex gap-2 mt-2 flex-wrap">
                {photoUrls.map((url, i) => (
                  <div key={i} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" className="w-16 h-16 object-cover rounded-lg" />
                    <button type="button" onClick={() => setPhotoUrls(p => p.filter((_,j) => j !== i))}
                      className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-4 h-4 text-xs flex items-center justify-center">×</button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 border border-gray-200 rounded-lg py-2 text-sm">Cancel</button>
            <button type="submit" disabled={saveMutation.isPending || uploading}
              className="flex-1 bg-brand-600 text-white rounded-lg py-2 text-sm font-semibold disabled:opacity-60">
              {saveMutation.isPending ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * useRealtimeBoats
 *
 * Subscribes to Supabase Realtime for live fleet updates.
 * Falls back to a 30s refetch interval if NEXT_PUBLIC_SUPABASE_URL
 * is not configured (local dev without Supabase).
 *
 * Supabase Realtime listens on the "boats" PostgreSQL table via logical
 * replication. Any INSERT/UPDATE/DELETE triggers a query client invalidation
 * so the UI re-fetches immediately.
 */
function useRealtimeBoats(queryClient: ReturnType<typeof useQueryClient>) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const channelRef  = useRef<any>(null);

  useEffect(() => {
    if (!supabaseUrl || !supabaseKey) return; // no Supabase configured

    // Dynamically import to keep the bundle lean when Supabase isn't used
    import('@supabase/supabase-js').then(({ createClient }) => {
      const supabase = createClient(supabaseUrl, supabaseKey);
      const channel  = supabase
        .channel('realtime:boats')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'boats' },
          () => {
            queryClient.invalidateQueries({ queryKey: ['boats'] });
          },
        )
        .subscribe();

      channelRef.current = { supabase, channel };
    });

    return () => {
      channelRef.current?.supabase?.removeChannel(channelRef.current.channel);
    };
  }, [supabaseUrl, supabaseKey, queryClient]);
}

export default function FleetList() {
  const api         = useApi();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Boat | null>(null);

  // Subscribe to Supabase Realtime for push updates.
  // When Supabase isn't configured, falls back to refetchInterval below.
  useRealtimeBoats(queryClient);

  const supabaseConfigured = !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  const { data: boats, isLoading, isError } = useQuery<Boat[]>({
    queryKey: ['boats', 'mine'],
    queryFn:  () => api.get('/boats/mine').then(r => r.data),
    // Only poll when Supabase Realtime is not available
    refetchInterval: supabaseConfigured ? false : 30_000,
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: Boat['status'] }) => api.patch(`/boats/${id}`, { status }),
    onSuccess:  () => queryClient.invalidateQueries({ queryKey: ['boats'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/boats/${id}`),
    onSuccess:  () => queryClient.invalidateQueries({ queryKey: ['boats'] }),
  });

  if (isLoading) return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {[1,2,3].map(i => (
        <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
          <div className="h-4 bg-gray-100 rounded w-2/3 mb-2" /><div className="h-3 bg-gray-100 rounded w-1/2" />
        </div>
      ))}
    </div>
  );

  if (isError) return (
    <div className="bg-white rounded-xl border border-dashed border-red-200 p-12 text-center">
      <p className="text-red-500">Couldn&apos;t load fleet. Please refresh.</p>
    </div>
  );

  if (!boats?.length) return (
    <div className="bg-white rounded-xl border border-dashed border-gray-300 p-12 text-center">
      <p className="text-gray-400">No boats yet. Add your first boat to get started.</p>
    </div>
  );

  return (
    <>
      {editing && <EditModal boat={editing} onClose={() => setEditing(null)} />}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {boats.map(boat => {
          const s = STATUS_CFG[boat.status];
          const firstPhoto = boat.photoUrls?.[0];
          return (
            <div key={boat.id}
              className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow flex flex-col">
              {firstPhoto
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={firstPhoto} alt={boat.name} className="w-full h-36 object-cover" />
                : <div className="w-full h-36 bg-blue-50 flex items-center justify-center text-4xl">⛵</div>
              }
              <div className="p-4 flex flex-col gap-3 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-gray-900">{boat.name}</h3>
                    <p className="text-sm text-gray-500">{boat.type} · {boat.capacity} guests</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap ${s.cls}`}>{s.label}</span>
                </div>

                {(boat.amenities ?? []).length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {boat.amenities.slice(0,4).map(a => (
                      <span key={a} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{a}</span>
                    ))}
                    {boat.amenities.length > 4 && <span className="text-xs text-gray-400">+{boat.amenities.length-4}</span>}
                  </div>
                )}

                <div>
                  <span className="text-lg font-bold text-gray-900">${boat.dailyRate}</span>
                  <span className="text-sm text-gray-500">/day</span>
                  {boat.hourlyRate != null && <span className="text-xs text-gray-400 ml-2">${boat.hourlyRate}/hr</span>}
                </div>

                <div className="flex gap-2 pt-1 border-t border-gray-100 mt-auto">
                  <select value={boat.status}
                    onChange={e => statusMutation.mutate({ id: boat.id, status: e.target.value as Boat['status'] })}
                    className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none">
                    <option value="available">Available</option>
                    <option value="booked">Booked</option>
                    <option value="maintenance">Maintenance</option>
                  </select>
                  <button onClick={() => setEditing(boat)}
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 hover:bg-gray-50">Edit</button>
                  <button onClick={() => { if (confirm(`Remove "${boat.name}"?`)) deleteMutation.mutate(boat.id); }}
                    className="text-xs text-red-500 border border-gray-200 rounded-lg px-2 py-1.5 hover:bg-red-50">Remove</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
