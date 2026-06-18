'use client';

import { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useApi } from '@/lib/useApi';

interface CsvRow {
  name: string; type: string; capacity: string; dailyRate: string;
  hourlyRate?: string; description?: string; amenities?: string;
}

const REQUIRED_COLS = ['name','type','capacity','dailyrate'];

function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines   = text.trim().split('\n').filter(Boolean);
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, '').toLowerCase());
  const rows    = lines.slice(1).map(line => {
    // Handle quoted fields with commas inside them
    const vals: string[] = [];
    let current = '';
    let inQuote = false;
    for (const ch of line) {
      if (ch === '"') { inQuote = !inQuote; continue; }
      if (ch === ',' && !inQuote) { vals.push(current.trim()); current = ''; continue; }
      current += ch;
    }
    vals.push(current.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = vals[i] ?? ''; });
    return row;
  });
  return { headers, rows };
}

export default function CsvImport() {
  const [open, setOpen]       = useState(false);
  const [rows, setRows]       = useState<CsvRow[]>([]);
  const [error, setError]     = useState('');
  const [preview, setPreview] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const api         = useApi();
  const queryClient = useQueryClient();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');

    if (!file.name.endsWith('.csv')) {
      setError('Please upload a .csv file');
      return;
    }

    const text = await file.text();
    const { headers, rows: parsed } = parseCSV(text);

    const missing = REQUIRED_COLS.filter(c => !headers.includes(c));
    if (missing.length) {
      setError(`Missing required columns: ${missing.join(', ')} (headers are case-insensitive)`);
      return;
    }

    if (parsed.length === 0) { setError('CSV file is empty'); return; }
    if (parsed.length > 500) { setError('Maximum 500 boats per import'); return; }

    setRows(parsed as unknown as CsvRow[]);
    setPreview(true);
  };

  // Calls the real backend /boats/import-csv endpoint with server-side validation
  const importMutation = useMutation({
    mutationFn: () => api.post('/boats/import-csv', { rows }),
    onSuccess: (response) => {
      const { created, failed, results } = response.data;
      queryClient.invalidateQueries({ queryKey: ['boats'] });
      if (failed > 0) {
        const failedNames = results
          .filter((r: any) => !r.success)
          .map((r: any) => `${r.name}: ${r.error}`)
          .join('\n');
        setError(`Imported ${created} boat(s). ${failed} failed:\n${failedNames}`);
        setPreview(false);
        setRows([]);
      } else {
        setOpen(false); setRows([]); setPreview(false); setError('');
      }
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
              Required columns: <code className="bg-gray-100 px-1 rounded text-xs">name, type, capacity, dailyRate</code>.
              Optional: <code className="bg-gray-100 px-1 rounded text-xs">hourlyRate, description, amenities</code> (semicolon-separated). Max 500 rows.
            </p>

            {!preview ? (
              <div className="space-y-4">
                <button onClick={downloadTemplate} className="text-sm text-brand-600 hover:underline">
                  ↓ Download template CSV
                </button>
                <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
                <button onClick={() => fileRef.current?.click()}
                  className="w-full border-2 border-dashed border-gray-200 rounded-xl p-8 text-gray-500 hover:border-brand-400 hover:text-brand-600 transition-colors text-sm">
                  Click to choose CSV file
                </button>
                {error && (
                  <pre className="text-sm text-red-600 bg-red-50 rounded-lg p-3 whitespace-pre-wrap">{error}</pre>
                )}
              </div>
            ) : (
              <div>
                <p className="text-sm text-gray-600 mb-3">
                  Found <strong>{rows.length}</strong> boat{rows.length !== 1 ? 's' : ''}. Review before importing:
                </p>
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
                          <td className="px-3 py-2 text-gray-600">${row.dailyRate || row.dailyrate}</td>
                          <td className="px-3 py-2 text-gray-600">{row.hourlyRate ? `$${row.hourlyRate}` : '—'}</td>
                          <td className="px-3 py-2 text-gray-600">{row.amenities ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {rows.length > 20 && <p className="text-xs text-gray-400 p-2 text-center">…and {rows.length - 20} more</p>}
                </div>
                {importMutation.isError && (
                  <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3 mb-3">Import failed. Please check your data and try again.</p>
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
