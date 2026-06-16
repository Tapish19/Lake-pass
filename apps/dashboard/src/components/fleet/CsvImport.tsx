'use client';

import { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useApi } from '@/lib/useApi';

interface CsvRow {
  name: string; type: string; capacity: string; dailyRate: string;
  hourlyRate?: string; description?: string; amenities?: string;
}

const REQUIRED_COLS = ['name','type','capacity','dailyRate'];

export default function CsvImport() {
  const [open, setOpen]         = useState(false);
  const [rows, setRows]         = useState<CsvRow[]>([]);
  const [error, setError]       = useState('');
  const [preview, setPreview]   = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const api         = useApi();
  const queryClient = useQueryClient();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    const text = await file.text();
    // Dynamically import PapaParse (already in api package; here we use a tiny inline parser)
    const lines = text.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g,'').toLowerCase());
    const missing = REQUIRED_COLS.filter(c => !headers.includes(c));
    if (missing.length) { setError(`Missing required columns: ${missing.join(', ')}`); return; }

    const parsed: CsvRow[] = lines.slice(1).filter(Boolean).map(line => {
      const vals = line.split(',').map(v => v.trim().replace(/"/g,''));
      const row: any = {};
      headers.forEach((h, i) => { row[h] = vals[i] ?? ''; });
      return row;
    });
    setRows(parsed);
    setPreview(true);
  };

  const importMutation = useMutation({
    mutationFn: () => Promise.all(rows.map(row =>
      api.post('/boats', {
        name:        row.name,
        type:        row.type,
        capacity:    Number(row.capacity),
        dailyRate:   Number(row.dailyRate),
        hourlyRate:  row.hourlyRate ? Number(row.hourlyRate) : undefined,
        description: row.description,
        amenities:   row.amenities ? row.amenities.split(';').map(s => s.trim()).filter(Boolean) : [],
        photoUrls:   [],
      })
    )),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['boats'] });
      setOpen(false); setRows([]); setPreview(false);
    },
  });

  const downloadTemplate = () => {
    const csv = 'name,type,capacity,dailyRate,hourlyRate,description,amenities\n'
      + '"Sunset Cruiser","Pontoon",10,350,75,"Great family boat","Tubes;Cooler;Life Jackets"';
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(blob), download: 'lake-pass-boat-import-template.csv',
    });
    a.click();
  };

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="border border-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
        Import CSV
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-1">Import Boats from CSV</h2>
            <p className="text-sm text-gray-500 mb-4">
              Upload a CSV with columns: <code className="bg-gray-100 px-1 rounded text-xs">name, type, capacity, dailyRate</code> (required) plus optional <code className="bg-gray-100 px-1 rounded text-xs">hourlyRate, description, amenities</code> (semicolon-separated).
            </p>

            {!preview ? (
              <div className="space-y-4">
                <button onClick={downloadTemplate}
                  className="text-sm text-brand-600 hover:underline">
                  ↓ Download template CSV
                </button>
                <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
                <button onClick={() => fileRef.current?.click()}
                  className="w-full border-2 border-dashed border-gray-200 rounded-xl p-8 text-gray-500 hover:border-brand-400 hover:text-brand-600 transition-colors text-sm">
                  Click to choose CSV file
                </button>
                {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</p>}
              </div>
            ) : (
              <div>
                <p className="text-sm text-gray-600 mb-3">Found <strong>{rows.length}</strong> boat{rows.length !== 1 ? 's' : ''}. Review before importing:</p>
                <div className="overflow-x-auto rounded-lg border border-gray-200 mb-4">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50">
                      <tr>{['Name','Type','Capacity','Daily Rate','Hourly Rate','Amenities'].map(h => (
                        <th key={h} className="text-left px-3 py-2 text-gray-500 font-medium whitespace-nowrap">{h}</th>
                      ))}</tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {rows.slice(0,20).map((row, i) => (
                        <tr key={i}>
                          <td className="px-3 py-2 font-medium text-gray-900">{row.name}</td>
                          <td className="px-3 py-2 text-gray-600">{row.type}</td>
                          <td className="px-3 py-2 text-gray-600">{row.capacity}</td>
                          <td className="px-3 py-2 text-gray-600">${row.dailyRate}</td>
                          <td className="px-3 py-2 text-gray-600">{row.hourlyRate ? `$${row.hourlyRate}` : '—'}</td>
                          <td className="px-3 py-2 text-gray-600">{row.amenities ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {rows.length > 20 && <p className="text-xs text-gray-400 p-2 text-center">…and {rows.length - 20} more</p>}
                </div>
                {importMutation.isError && (
                  <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3 mb-3">Some boats failed to import. Please check the data.</p>
                )}
                <div className="flex gap-3">
                  <button onClick={() => { setPreview(false); setRows([]); }}
                    className="flex-1 border border-gray-200 rounded-lg py-2 text-sm">Back</button>
                  <button onClick={() => importMutation.mutate()} disabled={importMutation.isPending}
                    className="flex-1 bg-brand-600 text-white rounded-lg py-2 text-sm font-semibold disabled:opacity-60">
                    {importMutation.isPending ? `Importing ${rows.length} boats…` : `Import ${rows.length} Boat${rows.length !== 1 ? 's' : ''}`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
