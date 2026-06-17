'use client';

// =============================================================================
// <FlashToast> — mostra un toast leggendo i query param ?flash=&flashType=.
// Serve ai form che fanno redirect su successo (creazione ingrediente/ricetta/
// ordine/fornitore): la pagina di destinazione mostra "Salvato" e l'URL viene
// ripulito dai param. Montato una volta nel layout → vale per tutte le pagine.
// =============================================================================

import { useEffect, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useToast } from '@/components/ui/Toast';

type FlashType = 'success' | 'error' | 'warning' | 'info';
const TYPES: FlashType[] = ['success', 'error', 'warning', 'info'];

export function FlashToast() {
  const { toast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const firedRef = useRef<string | null>(null);

  useEffect(() => {
    const flash = params.get('flash');
    if (!flash) return;
    // Evita doppio fire (es. StrictMode / re-render) sullo stesso messaggio.
    const key = `${pathname}|${flash}`;
    if (firedRef.current === key) return;
    firedRef.current = key;

    const rawType = params.get('flashType');
    const type: FlashType = TYPES.includes(rawType as FlashType) ? (rawType as FlashType) : 'success';
    toast(flash, type);

    // Ripulisci i param flash dall'URL (niente reload, niente jump di scroll).
    const next = new URLSearchParams(params);
    next.delete('flash');
    next.delete('flashType');
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [params, pathname, router, toast]);

  return null;
}
