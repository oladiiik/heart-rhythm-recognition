import type { ReactNode } from 'react';

interface FieldProps {
  readonly id: string;
  readonly label: string;
  readonly hint?: ReactNode;
  readonly children: ReactNode;
}

export function Field({ id, label, hint, children }: FieldProps) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && (
        <p className="field-hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
    </div>
  );
}

interface NumberFieldProps {
  readonly id: string;
  readonly label: string;
  readonly hint?: ReactNode;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly placeholder: string;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number | 'any';
  readonly disabled?: boolean;
}

export function NumberField({ id, label, hint, value, onChange, ...input }: NumberFieldProps) {
  return (
    <Field id={id} label={label} hint={hint}>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-describedby={hint ? `${id}-hint` : undefined}
        {...input}
      />
    </Field>
  );
}

export function Placeholder({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="placeholder">
      <p className="placeholder-title">{title}</p>
      <p>{children}</p>
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="form-error" role="alert">
      {message}
    </p>
  );
}
