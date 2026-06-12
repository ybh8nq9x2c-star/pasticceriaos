// =============================================================================
// <Input> / <Select> / <Textarea> — campi form con label sopra (mai floating),
// hint e messaggio d'errore inline. Validazione visiva via prop `error`.
// =============================================================================

'use client';

import { forwardRef, useId } from 'react';
import { cn } from '@/lib/utils';

const FIELD =
  'w-full rounded-md border border-border bg-surface-2 text-ink px-3 ' +
  'placeholder:text-ink-faint transition-colors duration-150 ease-smooth ' +
  'focus:outline-none focus:border-primary focus:ring-1 focus:ring-[color:var(--color-primary)]/30 ' +
  'disabled:opacity-50 disabled:cursor-not-allowed';

const FIELD_ERROR = 'border-danger focus:border-danger focus:ring-[color:var(--color-danger)]/30';

function FieldWrap({
  id,
  label,
  required,
  hint,
  error,
  children,
  className,
}: {
  id: string;
  label?: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('w-full', className)}>
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-ink mb-1.5">
          {label}
          {required ? <span className="text-danger"> *</span> : null}
        </label>
      )}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-ink-muted -mt-0.5 mb-1.5">
          {hint}
        </p>
      )}
      {children}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs text-danger mt-1.5">
          {error}
        </p>
      )}
    </div>
  );
}

type BaseProps = {
  label?: string;
  hint?: string;
  error?: string;
  wrapClassName?: string;
};

export const Input = forwardRef<HTMLInputElement, BaseProps & React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ label, hint, error, wrapClassName, className, id, required, ...rest }, ref) {
    const autoId = useId();
    const fieldId = id ?? autoId;
    return (
      <FieldWrap id={fieldId} label={label} required={required} hint={hint} error={error} className={wrapClassName}>
        <input
          ref={ref}
          id={fieldId}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
          className={cn(FIELD, 'h-10 text-base', error && FIELD_ERROR, className)}
          {...rest}
        />
      </FieldWrap>
    );
  },
);

export const Select = forwardRef<HTMLSelectElement, BaseProps & React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ label, hint, error, wrapClassName, className, id, required, children, ...rest }, ref) {
    const autoId = useId();
    const fieldId = id ?? autoId;
    return (
      <FieldWrap id={fieldId} label={label} required={required} hint={hint} error={error} className={wrapClassName}>
        <select
          ref={ref}
          id={fieldId}
          required={required}
          aria-invalid={error ? true : undefined}
          className={cn(FIELD, 'h-10 text-base', error && FIELD_ERROR, className)}
          {...rest}
        >
          {children}
        </select>
      </FieldWrap>
    );
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, BaseProps & React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ label, hint, error, wrapClassName, className, id, required, ...rest }, ref) {
    const autoId = useId();
    const fieldId = id ?? autoId;
    return (
      <FieldWrap id={fieldId} label={label} required={required} hint={hint} error={error} className={wrapClassName}>
        <textarea
          ref={ref}
          id={fieldId}
          required={required}
          aria-invalid={error ? true : undefined}
          className={cn(FIELD, 'py-2.5 text-base resize-none', error && FIELD_ERROR, className)}
          {...rest}
        />
      </FieldWrap>
    );
  },
);
