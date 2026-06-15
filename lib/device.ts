// =============================================================================
// lib/device.ts
// Rilevazione device/capacità lato CLIENT per la UX dello scanner. Da chiamare
// solo dopo il mount (in useEffect): legge navigator/window in modo guardato.
// La scelta del layout scanner è guidata dalla CAPABILITY (BarcodeDetector) più
// che dallo user-agent: euristica robusta e onesta ("questo browser ha un motore
// barcode affidabile?"), con isIOS solo per il messaggio specifico iPhone/iPad.
// =============================================================================

/** True su iPhone/iPad/iPod, incluso iPadOS 13+ che si maschera da Mac. */
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  // iPadOS 13+ riporta "MacIntel" ma con touch: distinguilo da un Mac desktop.
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

/** True se il browser ha il decoder barcode nativo (Android Chrome, Chrome/Edge desktop). */
export function hasBarcodeDetector(): boolean {
  return typeof window !== 'undefined' && 'BarcodeDetector' in window;
}
