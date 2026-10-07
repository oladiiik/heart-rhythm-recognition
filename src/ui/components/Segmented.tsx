import type { ReactNode } from 'react';

export interface SegmentOption<Value extends string> {
  readonly value: Value;
  readonly label: ReactNode;
}

interface SegmentedProps<Value extends string> {
  readonly label: string;
  readonly name: string;
  readonly value: Value;
  readonly options: readonly SegmentOption<Value>[];
  readonly onChange: (value: Value) => void;
  readonly disabled?: boolean;
  readonly className?: string;
}

export function Segmented<Value extends string>({
  label,
  name,
  value,
  options,
  onChange,
  disabled = false,
  className,
}: SegmentedProps<Value>) {
  return (
    <div className={className ? `segmented ${className}` : 'segmented'} role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <label className={option.value === value ? 'segment segment-active' : 'segment'} key={option.value}>
          <input
            type="radio"
            name={name}
            checked={option.value === value}
            disabled={disabled}
            onChange={() => onChange(option.value)}
          />
          {option.label}
        </label>
      ))}
    </div>
  );
}
