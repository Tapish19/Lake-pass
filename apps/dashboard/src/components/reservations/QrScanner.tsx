'use client';

/**
 * QrScanner — camera-based QR check-in for the marina dashboard.
 *
 * Uses the browser's MediaDevices API + a lightweight QR decoder.
 * When a valid reservation QR code is scanned, it calls the check-in
 * API endpoint and shows the result to the staff member.
 *
 * QR code format expected: a plain reservation ID string (cuid),
 * e.g. "clxyz1234abcd5678" — matching what is printed on the
 * customer's confirmation email / app booking screen.
 *
 * Depends on: @zxing/browser (ZXing for the browser — pure JS, no WASM).
 * Install: pnpm add @zxing/browser @zxing/library  (in apps/dashboard)
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useApi } from '@/lib/useApi';

type ScanState = 'idle' | 'scanning' | 'found' | 'success' | 'error';

interface CheckInResult {
  id: string;
  status: string;
  checkedInAt: string;
  boat?: { name: string };
  user?: { name: string };
  walkInName?: string;
}

export default function QrScanner({ onClose }: { onClose: () => void }) {
  const api         = useApi();
  const queryClient = useQueryClient();
  const videoRef    = useRef<HTMLVideoElement>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const readerRef   = useRef<any>(null);

  const [state, setState]     = useState<ScanState>('idle');
  const [message, setMessage] = useState('');
  const [result, setResult]   = useState<CheckInResult | null>(null);
  const [cameraError, setCameraError] = useState('');

  const checkInMutation = useMutation({
    mutationFn: (reservationId: string) => api.patch(`/reservations/${reservationId}/check-in`, {}),
    onSuccess: (res) => {
      setResult(res.data);
      setState('success');
      queryClient.invalidateQueries({ queryKey: ['marina-reservations'] });
    },
    onError: (err: any) => {
      setMessage(err?.response?.data?.error ?? 'Check-in failed. Please try again.');
      setState('error');
    },
  });

  const handleScannedCode = useCallback((text: string) => {
    // Stop further scans immediately
    readerRef.current?.reset?.();
    setState('found');
    setMessage(`Scanning reservation: ${text.slice(0, 12)}…`);
    checkInMutation.mutate(text.trim());
  }, [checkInMutation]);

  const startScanner = useCallback(async () => {
    setCameraError('');
    setState('scanning');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      // Dynamically import ZXing to keep bundle lean
      const { BrowserQRCodeReader } = await import('@zxing/browser');
      const reader = new BrowserQRCodeReader();
      readerRef.current = reader;

      reader.decodeFromVideoElement(videoRef.current!, (result, err) => {
        if (result) {
          handleScannedCode(result.getText());
        }
        // err here is normal when no QR is in frame — ignore it
      });
    } catch (err: any) {
      if (err?.name === 'NotAllowedError') {
        setCameraError('Camera access denied. Please allow camera access in your browser settings.');
      } else if (err?.name === 'NotFoundError') {
        setCameraError('No camera found. Please use a device with a camera.');
      } else {
        setCameraError(`Camera error: ${err?.message ?? 'Unknown error'}`);
      }
      setState('idle');
    }
  }, [handleScannedCode]);

  const stopScanner = useCallback(() => {
    readerRef.current?.reset?.();
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  const reset = useCallback(() => {
    stopScanner();
    setState('idle');
    setMessage('');
    setResult(null);
  }, [stopScanner]);

  // Cleanup on unmount
  useEffect(() => () => stopScanner(), [stopScanner]);

  const guestName = result?.walkInName ?? result?.user?.name ?? 'Customer';

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl p-6 w-full max-w-md"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">QR Check-in</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        {state === 'idle' && (
          <div className="text-center py-6 space-y-4">
            <div className="text-5xl">📷</div>
            <p className="text-gray-600 text-sm">
              Scan the QR code on the customer's booking confirmation to check them in.
            </p>
            {cameraError && (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{cameraError}</p>
            )}
            <button
              onClick={startScanner}
              className="w-full bg-brand-600 text-white rounded-lg py-3 text-sm font-semibold hover:bg-brand-700"
            >
              Start Camera
            </button>
          </div>
        )}

        {state === 'scanning' && (
          <div className="space-y-3">
            <div className="relative rounded-xl overflow-hidden bg-black aspect-video">
              <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
              {/* Targeting reticle */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-48 h-48 border-2 border-white/70 rounded-xl relative">
                  <span className="absolute -top-0.5 -left-0.5 w-6 h-6 border-t-2 border-l-2 border-brand-400 rounded-tl-lg" />
                  <span className="absolute -top-0.5 -right-0.5 w-6 h-6 border-t-2 border-r-2 border-brand-400 rounded-tr-lg" />
                  <span className="absolute -bottom-0.5 -left-0.5 w-6 h-6 border-b-2 border-l-2 border-brand-400 rounded-bl-lg" />
                  <span className="absolute -bottom-0.5 -right-0.5 w-6 h-6 border-b-2 border-r-2 border-brand-400 rounded-br-lg" />
                </div>
              </div>
            </div>
            <p className="text-center text-sm text-gray-500">Point camera at the customer's QR code…</p>
            <button onClick={reset} className="w-full border border-gray-200 rounded-lg py-2 text-sm">Cancel</button>
          </div>
        )}

        {state === 'found' && (
          <div className="text-center py-8 space-y-3">
            <div className="text-4xl animate-spin">⏳</div>
            <p className="text-gray-600 text-sm">{message}</p>
          </div>
        )}

        {state === 'success' && result && (
          <div className="text-center py-6 space-y-4">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto text-3xl">✓</div>
            <div>
              <p className="font-semibold text-gray-900 text-lg">Checked in!</p>
              <p className="text-gray-600 text-sm mt-1">
                <strong>{guestName}</strong> — {result.boat?.name ?? 'Boat'}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {new Date(result.checkedInAt).toLocaleTimeString()}
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={reset} className="flex-1 border border-gray-200 rounded-lg py-2 text-sm">Scan Another</button>
              <button onClick={onClose} className="flex-1 bg-brand-600 text-white rounded-lg py-2 text-sm font-semibold">Done</button>
            </div>
          </div>
        )}

        {state === 'error' && (
          <div className="text-center py-6 space-y-4">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto text-3xl">✗</div>
            <div>
              <p className="font-semibold text-gray-900">Check-in Failed</p>
              <p className="text-sm text-red-600 mt-1">{message}</p>
            </div>
            <div className="flex gap-3">
              <button onClick={reset} className="flex-1 border border-gray-200 rounded-lg py-2 text-sm">Try Again</button>
              <button onClick={onClose} className="flex-1 bg-gray-200 text-gray-700 rounded-lg py-2 text-sm">Close</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
