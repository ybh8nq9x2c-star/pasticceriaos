'use client';

// Scrolla in vista la riga mappatura evidenziata (arrivando da /sales/[id]).
import { useEffect } from 'react';

export function HighlightScroll({ targetId }: { targetId: string }) {
  useEffect(() => {
    const el = document.getElementById(targetId);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [targetId]);
  return null;
}
