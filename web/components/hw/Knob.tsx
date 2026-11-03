"use client";

import { useRef } from "react";

// Manopola come su un mixer: trascina su/giù (o usa rotellina e frecce), doppio clic = valore di partenza.
// Corsa di 270°, da -135° a +135°, come le manopole vere.
export function Knob({
  label,
  value,
  min,
  max,
  step = 0.01,
  defaultValue,
  display,
  onChange,
  size = 56,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  defaultValue?: number;
  display?: string;
  onChange: (v: number) => void;
  size?: number;
}) {
  const drag = useRef<{ y: number; v: number } | null>(null);
  const span = max - min;
  const clampSnap = (v: number) => Math.min(max, Math.max(min, Math.round(v / step) * step));
  const angle = -135 + ((value - min) / span) * 270;

  return (
    <div className="hw-knob" style={{ width: size + 24 }}>
      <div
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={display}
        className="hw-knob-body"
        style={{ width: size, height: size }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { y: e.clientY, v: value };
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          // 200 px di trascinamento = tutta la corsa; con Shift va 5 volte più fine
          const k = e.shiftKey ? 1000 : 200;
          onChange(clampSnap(drag.current.v + ((drag.current.y - e.clientY) / k) * span));
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        onDoubleClick={() => defaultValue !== undefined && onChange(defaultValue)}
        onWheel={(e) => onChange(clampSnap(value - Math.sign(e.deltaY) * span * 0.02))}
        onKeyDown={(e) => {
          const big = e.shiftKey ? 10 : 1;
          if (e.key === "ArrowUp" || e.key === "ArrowRight") onChange(clampSnap(value + step * big));
          else if (e.key === "ArrowDown" || e.key === "ArrowLeft") onChange(clampSnap(value - step * big));
          else return;
          e.preventDefault();
        }}
      >
        <svg viewBox="0 0 100 100" aria-hidden="true">
          {/* tacche della scala serigrafate intorno */}
          {Array.from({ length: 11 }, (_, i) => {
            const a = ((-135 + i * 27 - 90) * Math.PI) / 180;
            // arrotondo: server e browser calcolano il seno con decimali diversi (errore di hydration)
            const r = (n: number) => Math.round(n * 100) / 100;
            return (
              <line
                key={i}
                x1={r(50 + Math.cos(a) * 44)}
                y1={r(50 + Math.sin(a) * 44)}
                x2={r(50 + Math.cos(a) * 49)}
                y2={r(50 + Math.sin(a) * 49)}
                className="hw-knob-tick"
              />
            );
          })}
          <circle cx="50" cy="50" r="36" className="hw-knob-cap" />
          <circle cx="50" cy="50" r="28" className="hw-knob-top" />
          <line x1="50" y1="50" x2="50" y2="20" className="hw-knob-pointer" transform={`rotate(${angle} 50 50)`} />
        </svg>
      </div>
      <span className="hw-label">{label}</span>
      {display && <span className="hw-value">{display}</span>}
    </div>
  );
}
