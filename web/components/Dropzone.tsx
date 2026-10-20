"use client";

import { useRef, useState } from "react";
import { AUDIO_EXTENSIONS } from "@/lib/options";

// Zona dove trascinare i file; cliccandola si apre anche il selettore dei file.
export function Dropzone({
  label,
  multiple = false,
  disabled = false,
  onFiles,
}: {
  label: string;
  multiple?: boolean;
  disabled?: boolean;
  onFiles: (files: File[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [active, setActive] = useState(false);

  return (
    <>
      <button
        type="button"
        className="ds-dropzone"
        data-active={active}
        disabled={disabled}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setActive(true);
        }}
        onDragLeave={() => setActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setActive(false);
          if (!disabled) onFiles(Array.from(e.dataTransfer.files));
        }}
      >
        {label}
      </button>
      <input
        ref={input}
        type="file"
        className="ds-visually-hidden"
        tabIndex={-1}
        accept={AUDIO_EXTENSIONS.join(",")}
        multiple={multiple}
        onChange={(e) => {
          onFiles(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
    </>
  );
}
