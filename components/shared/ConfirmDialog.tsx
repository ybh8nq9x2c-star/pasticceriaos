// =============================================================================
// <ConfirmDialog> — conferma esplicita per azioni distruttive o con
// conseguenze (elimina, completa piano con shortage). Spiega SEMPRE cosa
// succede; il bottone di conferma mostra loading durante l'azione.
// =============================================================================

'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button, type ButtonVariant } from '@/components/ui/Button';

export function ConfirmDialog({
  open,
  onClose,
  title,
  description,
  children,
  confirmLabel,
  confirmVariant = 'danger',
  cancelLabel = 'Annulla',
  onConfirm,
  extraAction,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Spiegazione dell'azione e delle conseguenze. */
  description?: string;
  /** Contenuto aggiuntivo (es. lista ingredienti coinvolti). */
  children?: React.ReactNode;
  confirmLabel: string;
  confirmVariant?: ButtonVariant;
  cancelLabel?: string;
  onConfirm: () => Promise<void> | void;
  /** Terza azione opzionale (es. "Genera ordine prima"). */
  extraAction?: React.ReactNode;
}) {
  const [busy, setBusy] = useState(false);

  async function handleConfirm() {
    setBusy(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </Button>
          {extraAction}
          <Button variant={confirmVariant} onClick={handleConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {description && <p className="text-base text-ink-muted">{description}</p>}
      {children}
    </Modal>
  );
}
