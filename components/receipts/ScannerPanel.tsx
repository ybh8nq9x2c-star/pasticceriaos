'use client';

// =============================================================================
// <ScannerPanel> — acquisizione barcode per il goods receipt engine.
// Due UX, scelte per CAPABILITY (non per finta):
//   • CAPABLE (Android/desktop con BarcodeDetector): fotocamera primaria, motore
//     nativo affidabile su GS1-128; input manuale in fondo. UX invariata.
//   • BEST-EFFORT (iPhone/iOS o browser senza BarcodeDetector): scanner esterno
//     / input manuale PRIMARIO e autofocato (keyboard-wedge friendly), banner
//     onesto, fotocamera disponibile ma secondaria.
// In entrambi: parse GS1-128 immediato (SSCC/GTIN/lotto/scadenza) e conferma
// rapida. registerScan e parseGs1 invariati. Richiede HTTPS per getUserMedia.
// =============================================================================

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { Camera, CameraOff, Check, Crosshair, Keyboard, RefreshCw, ScanLine } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { registerScanAction } from '@/modules/goods-receipts/actions';
import { parseGs1, gs1IsoToItalian, type Gs1Parsed } from '@/modules/goods-receipts/gs1';
import { isIOS, hasBarcodeDetector } from '@/lib/device';
import { IDLE_STATE, type ActionState, cn } from '@/lib/utils';
import type { ReceiptMode } from '@/modules/goods-receipts/types';
import type { ScanOutcome } from '@/modules/goods-receipts/service';

type ScannerPhase = 'idle' | 'requesting' | 'active' | 'denied' | 'unsupported' | 'confirm';

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
  disabled?: boolean;
}) {
  const [phase, setPhase] = useState<ScannerPhase>('idle');
  const [engine, setEngine] = useState<'native' | 'fallback' | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [parsed, setParsed] = useState<Gs1Parsed | null>(null);
  const [qty, setQty] = useState('1');
  const [lot, setLot] = useState('');
  const [expiry, setExpiry] = useState('');
  const [result, setResult] = useState<(ActionState & { outcome?: ScanOutcome }) | null>(null);
  const [pending, startTransition] = useTransition();

  // UX device-aware (calcolata dopo il mount → niente hydration mismatch).
  const [bestEffort, setBestEffort] = useState(false);
  const [isIos, setIsIos] = useState(false);
  // Preferenza "Invio automatico": qui nel parent così persiste tra una scan e
  // l'altra (il campo manuale si smonta in fase 'confirm'). Cambia di rado →
  // nessun impatto sulla digitazione.
  const [autoSubmit, setAutoSubmit] = useState(true);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const html5Ref = useRef<Html5QrcodeLike | null>(null);
  const lastCodeRef = useRef<{ value: string; at: number }>({ value: '', at: 0 });

  useEffect(() => {
    setIsIos(isIOS());
    setBestEffort(isIOS() || !hasBarcodeDetector());
  }, []);

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

  // ── Lettura riuscita (debounce anti doppia-lettura) → parse GS1 → conferma ──
  const onDecoded = useCallback((raw: string) => {
    const value = raw.trim();
    if (!value) return;
    const now = Date.now();
    if (lastCodeRef.current.value === value && now - lastCodeRef.current.at < 2500) return;
    lastCodeRef.current = { value, at: now };

    const g = parseGs1(value);
    setParsed(g);
    setCode(g.primary);
    if (g.lot) setLot(g.lot);
    // Scadenza: usa la scadenza (17) o, in mancanza, il best-before (15).
    if (g.expiryForReceipt) setExpiry(g.expiryForReceipt);

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
      }
    }

    try {
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode');
      // Limitare i formati riduce l'ambiguità del locator ZXing su barcode
      // lineari (GS1-128/EAN) e velocizza: più affidabile su iOS/Firefox.
      const instance = new Html5Qrcode(SCAN_REGION_ID, {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.QR_CODE,
        ],
        verbose: false,
      }) as unknown as Html5QrcodeLike;
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
    // Tracciabilità: invia il raw GS1 originale; il server lo riparsa e persiste
    // SSCC/GTIN/colli/date/AI. Solo per letture GS1 (non per EAN/codici semplici).
    if (parsed?.isGs1 && parsed.raw) fd.set('gs1Raw', parsed.raw);
    startTransition(async () => {
      const res = await registerScanAction(IDLE_STATE, fd);
      setResult(res);
      if (res.status === 'success') {
        setCode(null);
        setParsed(null);
        setQty('1');
        setLot('');
        setExpiry('');
        setPhase('idle');
      }
    });
  }

  if (disabled) return null;

  // ── Pezzi riutilizzabili ────────────────────────────────────────────────────

  const cameraViewport = (
    <div className="relative rounded-md overflow-hidden bg-surface-offset border border-border">
      <div id={SCAN_REGION_ID} className={cn(engine === 'fallback' ? 'block' : 'hidden')} />
      <video
        ref={videoRef}
        playsInline
        muted
        className={cn('w-full aspect-[4/3] object-cover', engine === 'native' && phase === 'active' ? 'block' : 'hidden')}
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
                Fotocamera non disponibile o permesso negato. Usa lo scanner esterno o l&apos;inserimento manuale.
              </p>
              <Button variant="secondary" size="sm" onClick={() => void startCamera()}>
                <RefreshCw size={14} aria-hidden="true" /> Riprova
              </Button>
            </>
          ) : phase === 'unsupported' ? (
            <>
              <CameraOff size={40} strokeWidth={1.5} className="text-ink-faint" aria-hidden="true" />
              <p className="text-sm text-ink-muted max-w-[36ch]">
                Questo browser non supporta la scansione. Usa lo scanner esterno o l&apos;inserimento manuale.
              </p>
            </>
          ) : (
            <>
              <Camera size={40} strokeWidth={1.5} className="text-ink-faint" aria-hidden="true" />
              <p className="text-sm text-ink-muted">Inquadra il barcode del collo o del prodotto.</p>
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
  );

  // Campo manuale isolato: la digitazione/incolla del barcode aggiorna lo stato
  // LOCALE del campo, non l'intero ScannerPanel (camera, preview, dl GS1).
  const scannerField = (
    <ManualScanField
      bestEffort={bestEffort}
      autoFocus={bestEffort && phase === 'idle'}
      autoSubmit={autoSubmit}
      onAutoSubmitChange={setAutoSubmit}
      onSubmit={onDecoded}
    />
  );

  const confirmStep = code && (
    <div className="space-y-3 animate-state-fade">
      {parsed?.isGs1 ? (
        <div className="rounded-md bg-surface-offset px-3 py-2 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs uppercase tracking-wide text-ink-muted">Etichetta GS1-128 letta</p>
            <Badge variant="info" size="sm">GS1</Badge>
          </div>
          <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-0.5 text-sm">
            {parsed.gtin && (<><dt className="text-ink-muted">GTIN</dt><dd className="font-mono text-ink truncate">{parsed.gtin}</dd></>)}
            {parsed.gtinContent && !parsed.gtin && (<><dt className="text-ink-muted">GTIN contenuto</dt><dd className="font-mono text-ink truncate">{parsed.gtinContent}</dd></>)}
            {parsed.sscc && (<><dt className="text-ink-muted">SSCC</dt><dd className="font-mono text-ink truncate">{parsed.sscc}</dd></>)}
            {parsed.lot && (<><dt className="text-ink-muted">Lotto</dt><dd className="font-mono text-ink truncate">{parsed.lot}</dd></>)}
            {parsed.expiryForReceipt && (<><dt className="text-ink-muted">Scadenza</dt><dd className="font-mono text-ink">{gs1IsoToItalian(parsed.expiryForReceipt)}</dd></>)}
            {parsed.caseQuantity != null && (<><dt className="text-ink-muted">Colli/pezzi</dt><dd className="font-mono text-ink">{parsed.caseQuantity}</dd></>)}
            {parsed.productionDate && (<><dt className="text-ink-muted">Produzione</dt><dd className="font-mono text-ink">{gs1IsoToItalian(parsed.productionDate)}</dd></>)}
            {parsed.netWeight && (<><dt className="text-ink-muted">Peso netto</dt><dd className="font-mono text-ink">{parsed.netWeight.value} {parsed.netWeight.unit}</dd></>)}
          </dl>
          {!parsed.gtin && parsed.sscc && (
            <p className="text-xs text-warning-strong">
              Codice logistico (SSCC): non identifica un prodotto. Associa la riga manualmente dopo la registrazione.
            </p>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 rounded-md bg-surface-offset px-3 py-2">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-ink-muted">Codice letto</p>
            <p className="font-mono text-md text-ink truncate">{code}</p>
          </div>
          <Badge variant="info" size="sm">1 · Codice</Badge>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Input label="Quantità" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} required />
        <Input label="Lotto (opz.)" value={lot} onChange={(e) => setLot(e.target.value)} placeholder="es. FA26-0610" />
      </div>
      <Input label="Scadenza (opz.)" type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
      <div className="flex gap-2">
        <Button variant="secondary" fullWidth onClick={() => { setCode(null); setParsed(null); setPhase('idle'); }}>
          Annulla
        </Button>
        <Button fullWidth loading={pending} onClick={() => code && submitScan(code)}>
          <Check size={16} aria-hidden="true" /> Registra
        </Button>
      </div>
    </div>
  );

  const honestBanner = (
    <div className="rounded-md bg-warning-light px-3 py-2 text-sm text-warning-strong">
      {isIos
        ? 'Su iPhone la scansione camera di barcode industriali (GS1-128/SSCC) può essere meno affidabile. Per il magazzino consigliamo uno scanner esterno o l’inserimento rapido qui sopra.'
        : 'Su questo browser la scansione camera di barcode industriali può essere meno affidabile. Usa uno scanner esterno o l’inserimento rapido qui sopra.'}
    </div>
  );

  const secondaryCameraButton = (
    <button
      type="button"
      onClick={() => void startCamera()}
      className="w-full rounded-md border border-border bg-surface-2 py-2.5 text-sm font-medium text-ink-muted hover:bg-surface-offset inline-flex items-center justify-center gap-2"
    >
      <Camera size={16} aria-hidden="true" /> Prova comunque la fotocamera (best-effort)
    </button>
  );

  return (
    <section aria-label="Scanner merce" className="bg-surface-2 rounded-lg border border-border shadow-sm overflow-hidden">
      <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-divider">
        <h2 className="flex items-center gap-2 text-md font-semibold text-ink">
          <ScanLine size={16} aria-hidden="true" className="text-ink-muted" />
          Scansiona merce
        </h2>
        {engine && phase === 'active' && (
          <Badge variant="neutral" size="sm">{engine === 'native' ? 'Scanner nativo' : 'Scanner compatibile'}</Badge>
        )}
      </header>

      <div className="p-4 space-y-4">
        {result?.status === 'success' && (
          <p
            role="status"
            className={cn(
              'rounded-md px-3 py-2 text-sm animate-state-fade',
              result.outcome?.status === 'matched' ? 'bg-success-light text-success-strong' : 'bg-warning-light text-warning-strong',
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

        {phase === 'confirm' ? (
          confirmStep
        ) : bestEffort ? (
          <div className="space-y-3">
            {honestBanner}
            {scannerField}
            {phase === 'idle' ? secondaryCameraButton : cameraViewport}
          </div>
        ) : (
          <>
            {cameraViewport}
            {scannerField}
          </>
        )}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Campo barcode manuale / keyboard-wedge — stato LOCALE per non ri-renderizzare
// l'intero ScannerPanel a ogni carattere digitato o incollato.
// ─────────────────────────────────────────────────────────────────────────────

function ManualScanField({
  bestEffort,
  autoFocus,
  autoSubmit,
  onAutoSubmitChange,
  onSubmit,
}: {
  bestEffort: boolean;
  autoFocus: boolean;
  autoSubmit: boolean;
  onAutoSubmitChange: (v: boolean) => void;
  onSubmit: (value: string) => void;
}) {
  const [manual, setManual] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const burstRef = useRef<number>(0);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => () => window.clearTimeout(burstRef.current), []);

  function handleChange(v: string) {
    setManual(v);
    window.clearTimeout(burstRef.current);
    if (!bestEffort || !autoSubmit) return;
    const value = v.trim();
    // Auto-submit "a burst": scanner che NON inviano Enter. Gate su codice
    // plausibilmente completo per non inviare mentre si digita un parziale.
    const looksComplete = value.length >= 8 && (parseGs1(value).isGs1 || /^\d{8,14}$/.test(value));
    if (looksComplete) {
      burstRef.current = window.setTimeout(() => {
        setManual('');
        onSubmit(value);
      }, 140);
    }
  }

  function submit() {
    window.clearTimeout(burstRef.current);
    const value = manual.trim();
    if (value.length >= 3) {
      setManual('');
      onSubmit(value);
    }
  }

  return (
    <form
      className={cn(
        'flex flex-col gap-2',
        bestEffort ? 'rounded-md border border-primary-soft bg-primary-light/40 p-3' : 'border-t border-divider pt-4',
      )}
      onSubmit={(e) => { e.preventDefault(); submit(); }}
    >
      <div className="flex items-end gap-2">
        <Input
          ref={inputRef}
          label={bestEffort ? 'Spara il codice con lo scanner, oppure digita/incolla' : 'Oppure inserisci il codice manualmente'}
          value={manual}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="es. 0108001234567890 17261031 10L1A2"
          inputMode="text"
          autoComplete="off"
          wrapClassName="flex-1"
        />
        <Button type="submit" variant={bestEffort ? 'primary' : 'secondary'} aria-label="Usa il codice inserito">
          <Keyboard size={16} aria-hidden="true" />
          <span className="hidden sm:inline">{bestEffort ? 'Conferma' : 'Usa codice'}</span>
        </Button>
      </div>
      {bestEffort && (
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => inputRef.current?.focus()}
            className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1"
          >
            <Crosshair size={13} aria-hidden="true" /> Metti a fuoco il campo scanner
          </button>
          <label className="flex items-center gap-1.5 text-xs text-ink-muted cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoSubmit}
              onChange={(e) => onAutoSubmitChange(e.target.checked)}
              className="accent-[var(--color-primary)]"
            />
            Invio automatico
          </label>
        </div>
      )}
    </form>
  );
}
