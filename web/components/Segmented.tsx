"use client";

// Gruppo di pad dove ne è premuto uno solo (sottogenere, stadio, export).
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="ds-field" role="group" aria-label={label}>
      <span className="ds-label">{label}</span>
      <div className="ds-segmented">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            className="ds-pad"
            aria-pressed={value === o.value}
            disabled={disabled}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
