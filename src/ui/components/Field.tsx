import type { ReactNode } from 'react';

interface FieldProps {
  readonly id: string;
  readonly label: string;
  readonly hint?: string;
  readonly children: ReactNode;
}

export function Field({ id, label, hint, children }: FieldProps) {
  return (
    <div className="field" title={hint}>
      <label htmlFor={id}>{label}</label>
      {children}
    </div>
  );
}

interface NumberFieldProps {
  readonly id: string;
  readonly label: string;
  readonly hint?: string;
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
        {...input}
      />
    </Field>
  );
}

interface PlaceholderProps {
  readonly title: string;
  readonly children: ReactNode;
  readonly inline?: boolean;
}

export function Placeholder({ title, children, inline = false }: PlaceholderProps) {
  return (
    <div className={inline ? 'placeholder placeholder-inline' : 'placeholder'}>
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
