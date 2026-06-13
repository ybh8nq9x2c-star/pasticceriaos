'use client';

// =============================================================================
// <ScannerPanel> — scanner barcode da fotocamera per il goods receipt engine.
// Strategia: BarcodeDetector nativo quando disponibile (Chrome/Edge/Android),
// fallback dinamico a html5-qrcode (iOS Safari, Firefox). Sempre disponibile
// l'inserimento manuale del codice: lo scanner non è mai un dead-end.
// Formati: EAN-13, EAN-8, Code 128, QR (+ GTIN da GS1-128 via normalizzazione).
// Richiede secure context (HTTPS) per getUserMedia.
// =============================================================================

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { Camera, CameraOff, Check, Keyboard, RefreshCw, ScanLine } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { registerScanAction } from '@/modules/goods-receipts/actions';
import { IDLE_STATE, type ActionState, cn } from '@/lib/utils';
import type { ReceiptMode } from '@/modules/goods-receipts/types';
import type { ScanOutcome } from '@/modules/goods-receipts/service';

type ScannerPhase =
  | 'idle'          // non avviato
  | 'requesting'    // permesso camera in corso
  | 'active'        // camera attiva, in lettura
  | 'denied'        // permesso negato / nessuna camera
  | 'unsupported'   // nessun motore di decodifica disponibile
  | 'confirm';      // codice letto → conferma qty/lotto/scadenza

interface Html5QrcodeLike {
  start(
    camera: { facingMode: string },
    config: { fps: number; qrbox?: { width: number; height: number } },
    onSuccess: (decodedText: string) => void,
    onFailure?: (error: string) => void,
  ): Promise<void>;
  stop(): Promise<void>;
  clear(): void;
}

const SCAN_REGION_ID = 'bk-scan-region';

export function ScannerPanel({
  receiptId,
  mode,
  disabled = false,
}: {
  receiptId: string;
  mode: ReceiptMode;
  /** true quando il receipt non è più modificabile. */
  disabled?: boolean;
}) {
  const [phase, setPhase] = useState<ScannerPhase>('idle');
  const [engine, setEngine] = useState<'native' | 'fallback' | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [manual, setManual] = useState('');
  const [qty, setQty] = useState('1');
  const [lot, setLot] = useState('');
  const [expiry, setExpiry] = useState('');
  const [result, setResult] = useState<(ActionState & { outcome?: ScanOutcome }) | null>(null);
  const [pending, startTransition] = useTransition();

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const html5Ref = useRef<Html5QrcodeLike | null>(null);
  const lastCodeRef = useRef<{ value: string; at: number }>({ value: '', at: 0 });

  // ── Spegnimento pulito di camera/decoder ───────────────────────────────────
  const stopCamera = useCallback(async () => {
    cancelAnimationFrame(rafRef.current);
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) track.stop();
      streamRef.current = null;
    }
    if (html5Ref.current) {
      try {
        await html5Ref.current.stop();
        html5Ref.current.clear();
      } catch {
        // già fermo
      }
      html5Ref.current = null;
    }
  }, []);

  useEffect(() => () => { void stopCamera(); }, [stopCamera]);

  // ── Lettura riuscita (debounce anti doppia-lettura dello stesso codice) ───
  const onDecoded = useCallback((raw: string) => {
    const value = raw.trim();
    if (!value) return;
    const now = Date.now();
    if (lastCodeRef.current.value === value && now - lastCodeRef.current.at < 2500) return;
    lastCodeRef.current = { value, at: now };
    setCode(value);
    setResult(null);
    setPhase('confirm');
    void stopCamera();
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate?.(80);
  }, [stopCamera]);

  // ── Avvio camera: BarcodeDetector → html5-qrcode → unsupported ────────────
  const startCamera = useCallback(async () => {
    setResult(null);
    setCode(null);
    setPhase('requesting');

    const w = window as typeof window & {
      BarcodeDetector?: new (opts: { formats: string[] }) => {
        detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
      };
    };

    // 1) Motore nativo
    if (w.BarcodeDetector && navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) throw new Error('video element mancante');
        video.srcObject = stream;
        await video.play();
        const detector = new w.BarcodeDetector({
          formats: ['ean_13', 'ean_8', 'code_128', 'qr_code', 'upc_a', 'upc_e'],
        });
        setEngine('native');
        setPhase('active');

        const tick = async () => {
          if (!streamRef.current || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes.length > 0) {
              onDecoded(codes[0].rawValue);
              return;
            }
          } catch {
            // frame non decodificabile: si continua
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
        return;
      } catch (err) {
        await stopCamera();
        if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'NotFoundError')) {
          setPhase('denied');
          return;
        }
        // altri errori → tenta il fallback
      }
    }

    // 2) Fallback cross-browser
    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      const instance = new Html5Qrcode(SCAN_REGION_ID) as unknown as Html5QrcodeLike;
      html5Ref.current = instance;
      setEngine('fallback');
      await instance.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 160 } },
        (text) => onDecoded(text),
        () => { /* frame senza codice: silenzioso */ },
      );
      setPhase('active');
    } catch (err) {
      await stopCamera();
      console.error('[scanner] avvio fallito', err);
      if (err instanceof DOMException && err.name === 'NotAllowedError') setPhase('denied');
      else setPhase('unsupported');
    }
  }, [onDecoded, stopCamera]);

  // ── Invio del codice confermato ─────────────────────────────────────────────
  function submitScan(scannedCode: string) {
    const fd = new FormData();
    fd.set('mode', mode);
    fd.set('receiptId', receiptId);
    fd.set('code', scannedCode);
    fd.set('qty', qty || '1');
    if (lot) fd.set('lotNumber', lot);
    if (expiry) fd.set('expiryDate', expiry);
    startTransition(async () => {
      const res = await registerScanAction(IDLE_STATE, fd);
      setResult(res);
      if (res.status === 'success') {
        setCode(null);
        setQty('1');
        setLot('');
        setExpiry('');
        setPhase('idle');
      }
    });
  }

  if (disabled) return null;

  return (
    <section
      aria-label="Scanner merce"
      className="bg-surface-2 rounded-lg border border-border shadow-sm overflow-hidden"
    >
      <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-divider">
        <h2 className="flex items-center gap-2 text-md font-semibold text-ink">
          <ScanLine size={16} aria-hidden="true" className="text-ink-muted" />
          Scansiona merce
        </h2>
        {engine && phase === 'active' && (
          <Badge variant="neutral" size="sm">
            {engine === 'native' ? 'Scanner nativo' : 'Scanner compatibile'}
          </Badge>
        )}
      </header>

      <div className="p-4 space-y-4">
        {/* Esito ultimo invio */}
        {result?.status === 'success' && (
          <p
            role="status"
            className={cn(
              'rounded-md px-3 py-2 text-sm animate-state-fade',
              result.outcome?.status === 'matched'
                ? 'bg-success-light text-success-strong'
                : 'bg-warning-light text-warning-strong',
            )}
          >
            {result.message}
          </p>
        )}
        {result?.status === 'error' && (
          <p role="alert" className="rounded-md bg-danger-light px-3 py-2 text-sm text-danger">
            {result.error}
          </p>
        )}

        {/* ── Viewport camera ────────────────────────────────────────────── */}
        {phase !== 'confirm' && (
          <div className="relative rounded-md overflow-hidden bg-surface-offset border border-border">
            {/* host del fallback html5-qrcode */}
            <div id={SCAN_REGION_ID} className={cn(engine === 'fallback' ? 'block' : 'hidden')} />
            <video
              ref={videoRef}
              playsInline
              muted
              className={cn(
                'w-full aspect-[4/3] object-cover',
                engine === 'native' && phase === 'active' ? 'block' : 'hidden',
              )}
            />
            {phase !== 'active' && (
              <div className="flex flex-col items-center justify-center gap-3 py-10 px-4 text-center">
                {phase === 'requesting' ? (
                  <>
                    <Camera size={40} strokeWidth={1.5} className="text-ink-faint" aria-hidden="true" />
                    <p className="text-sm text-ink-muted">Richiesta accesso alla fotocamera…</p>
                  </>
                ) : phase === 'denied' ? (
                  <>
                    <CameraOff size={40} strokeWidth={1.5} className="text-ink-faint" aria-hidden="true" />
                    <p className="text-sm text-ink-muted max-w-[36ch]">
                      Fotocamera non disponibile o permesso negato. Abilita la
                      fotocamera dalle impostazioni del browser, oppure inserisci
                      il codice manualmente qui sotto.
                    </p>
                    <Button variant="secondary" size="sm" onClick={() => void startCamera()}>
                      <RefreshCw size={14} aria-hidden="true" /> Riprova
                    </Button>
                  </>
                ) : phase === 'unsupported' ? (
                  <>
                    <CameraOff size={40} strokeWidth={1.5} className="text-ink-faint" aria-hidden="true" />
                    <p className="text-sm text-ink-muted max-w-[36ch]">
                      Questo browser non supporta la scansione. Usa l&apos;inserimento
                      manuale del codice qui sotto.
                    </p>
                  </>
                ) : (
                  <>
                    <Camera size={40} strokeWidth={1.5} className="text-ink-faint" aria-hidden="true" />
                    <p className="text-sm text-ink-muted">
                      Inquadra il barcode del collo o del prodotto.
                    </p>
                    <Button onClick={() => void startCamera()}>
                      <Camera size={16} aria-hidden="true" /> Avvia fotocamera
                    </Button>
                  </>
                )}
              </div>
            )}
            {phase === 'active' && (
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-glass backdrop-blur px-3 py-2">
                <span className="text-xs text-ink-muted">In lettura…</span>
                <Button variant="ghost" size="sm" onClick={() => void stopCamera().then(() => setPhase('idle'))}>
                  Ferma
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ── Step di conferma dopo lettura ──────────────────────────────── */}
        {phase === 'confirm' && code && (
          <div className="space-y-3 animate-state-fade">
            <div className="flex items-center justify-between gap-3 rounded-md bg-surface-offset px-3 py-2">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-wide text-ink-muted">Codice letto</p>
                <p className="font-mono text-md text-ink truncate">{code}</p>
              </div>
              <Badge variant="info" size="sm">1 · Codice</Badge>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Quantità"
                inputMode="decimal"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                required
              />
              <Input
                label="Lotto (opz.)"
                value={lot}
                onChange={(e) => setLot(e.target.value)}
                placeholder="es. FA26-0610"
              />
            </div>
            <Input
              label="Scadenza (opz.)"
              type="date"
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
            />
            <div className="flex gap-2">
              <Button
                variant="secondary"
                fullWidth
                onClick={() => { setCode(null); setPhase('idle'); }}
              >
                Annulla
              </Button>
              <Button fullWidth loading={pending} onClick={() => submitScan(code)}>
                <Check size={16} aria-hidden="true" /> Registra
              </Button>
            </div>
          </div>
        )}

        {/* ── Fallback manuale, sempre disponibile ───────────────────────── */}
        {phase !== 'confirm' && (
          <form
            className="flex items-end gap-2 border-t border-divider pt-4"
            onSubmit={(e) => {
              e.preventDefault();
              const value = manual.trim();
              if (value.length >= 3) {
                setManual('');
                onDecoded(value);
              }
            }}
          >
            <Input
              label="Oppure inserisci il codice manualmente"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="es. 8001234567890"
              inputMode="text"
              wrapClassName="flex-1"
            />
            <Button type="submit" variant="secondary" aria-label="Usa il codice inserito">
              <Keyboard size={16} aria-hidden="true" />
              <span className="hidden sm:inline">Usa codice</span>
            </Button>
          </form>
        )}
      </div>
    </section>
  );
}
