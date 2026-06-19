'use client';

import { useState, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useApi } from '@/lib/useApi';

interface BoatForm {
  name: string; type: string; capacity: number; dailyRate: number;
  hourlyRate?: number; description?: string; amenities: string;
  turnaroundBuffer: number;
}

const FIELD_CONFIG = [
  { name: 'name'             as const, label: 'Boat Name',                 type: 'text',   ph: 'e.g. Sunset Cruiser',        req: true  },
  { name: 'type'             as const, label: 'Boat Type',                 type: 'text',   ph: 'Pontoon / Ski / Fishing',    req: true  },
  { name: 'capacity'         as const, label: 'Guest Capacity',            type: 'number', ph: '8',                          req: true  },
  { name: 'dailyRate'        as const, label: 'Daily Rate ($)',             type: 'number', ph: '350',                        req: true  },
  { name: 'hourlyRate'       as const, label: 'Hourly Rate ($)',            type: 'number', ph: '75 (optional)',              req: false },
  { name: 'turnaroundBuffer' as const, label: 'Turnaround Buffer (minutes)', type: 'number', ph: '60',                      req: false },
  { name: 'amenities'        as const, label: 'Amenities (comma-separated)', type: 'text', ph: 'Tubes, Cooler, Life Jackets', req: false },
];

export default function AddBoatButton() {
  const [open, setOpen]           = useState(false);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const api         = useApi();
  const queryClient = useQueryClient();
  const { register, handleSubmit, reset, formState: { errors } } = useForm<BoatForm>({
    defaultValues: { turnaroundBuffer: 0 },
  });

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploading(true);
    try {
      const uploaded: string[] = [];
      for (const file of files) {
        const { data } = await api.post('/uploads/presign', { category: 'boat-photos', mimeType: file.type });
        await fetch(data.uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
        uploaded.push(data.publicUrl);
      }
      setPhotoUrls(prev => [...prev, ...uploaded]);
    } catch {
      alert('Photo upload failed — please try again.');
    } finally {
      setUploading(false);
    }
  };

  const createBoat = useMutation({
    mutationFn: (data: BoatForm) =>
      api.post('/boats', {
        name:             data.name,
        type:             data.type,
        capacity:         Number(data.capacity),
        dailyRate:        Number(data.dailyRate),
        hourlyRate:       data.hourlyRate ? Number(data.hourlyRate) : undefined,
        description:      data.description,
        turnaroundBuffer: Number(data.turnaroundBuffer ?? 0),
        amenities:        data.amenities ? data.amenities.split(',').map(s => s.trim()).filter(Boolean) : [],
        photoUrls,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['boats'] });
      reset(); setPhotoUrls([]); setOpen(false);
    },
  });

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-brand-700 transition-colors">
        + Add Boat
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setOpen(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-4">Add New Boat</h2>

            <form className="space-y-4" onSubmit={handleSubmit(d => createBoat.mutate(d))}>
              {FIELD_CONFIG.map(f => (
                <div key={f.name}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {f.label}
                    {f.name === 'turnaroundBuffer' && (
                      <span className="ml-1 text-xs text-gray-400">(buffer time between reservations)</span>
                    )}
                  </label>
                  <input type={f.type} placeholder={f.ph} step={f.type === 'number' ? 'any' : undefined}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    {...register(f.name, { required: f.req ? `${f.label} is required` : false,
                      ...(f.type === 'number' ? { valueAsNumber: true } : {}) })} />
                  {errors[f.name] && <p className="text-xs text-red-500 mt-1">{errors[f.name]?.message}</p>}
                </div>
              ))}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea rows={3} placeholder="Brief description…"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  {...register('description')} />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Photos</label>
                <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
                  onChange={handlePhotoChange} />
                <button type="button" onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="w-full border-2 border-dashed border-gray-200 rounded-lg p-4 text-sm text-gray-500 hover:border-brand-400 hover:text-brand-600 transition-colors disabled:opacity-60">
                  {uploading ? 'Uploading…' : '+ Add photos'}
                </button>
                {photoUrls.length > 0 && (
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {photoUrls.map((url, i) => (
                      <div key={i} className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="" className="w-16 h-16 object-cover rounded-lg" />
                        <button type="button"
                          onClick={() => setPhotoUrls(prev => prev.filter((_, j) => j !== i))}
                          className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-4 h-4 text-xs flex items-center justify-center">
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {createBoat.isError && (
                <p className="text-sm text-red-500 bg-red-50 rounded-lg p-3">
                  {(createBoat.error as any)?.response?.data?.error ?? 'Failed to add boat.'}
                </p>
              )}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setOpen(false); reset(); setPhotoUrls([]); }}
                  className="flex-1 border border-gray-200 rounded-lg py-2 text-sm">Cancel</button>
                <button type="submit" disabled={createBoat.isPending || uploading}
                  className="flex-1 bg-brand-600 text-white rounded-lg py-2 text-sm font-semibold disabled:opacity-60">
                  {createBoat.isPending ? 'Adding…' : 'Add Boat'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
