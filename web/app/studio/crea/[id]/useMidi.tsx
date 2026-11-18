"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { connectMidi, gmDrum, midiGranted, midiSupported } from "@/lib/daw/midi";
import type { ChannelId } from "@/lib/daw/project";
import { store, stored } from "./ui";

type Handlers = {
  playKey: (code: string, at?: number, midi?: { note: number; vel: number }) => boolean;
  hitPad: (c: ChannelId, at?: number, vel?: number) => void;
  releaseKey: (code: string, at: number) => void;
};

// La tastiera MIDI (lib/daw/midi.ts): si collega, ascolta i tasti e restituisce il pulsante MIDI per la colonna dei pad.
export function useMidi(keysRef: { current: { keyMode: string } }, handlers: Handlers) {
  const [midiState, setMidiState] = useState<{ on: boolean; names: string[]; error: string }>({ on: false, names: [], error: "" });
  const [midiHit, setMidiHit] = useState(false);
  // il controllo si fa nel browser, dopo il caricamento: sul server il MIDI non esiste
  const [midiOk, setMidiOk] = useState(false);
  const midiStop = useRef<(() => void) | null>(null);
  const midiRef = useRef(handlers);
  midiRef.current = handlers;
  const startMidi = useCallback(async () => {
    if (midiStop.current) return;
    try {
      midiStop.current = await connectMidi({
        on: (note, vel, at) => {
          const m = midiRef.current;
          if (keysRef.current.keyMode === "keys") m.playKey(`midi${note}`, at, { note, vel });
          else {
            const d = gmDrum(note);
            if (d) m.hitPad(d, at, vel);
          }
          setMidiHit(true);
          setTimeout(() => setMidiHit(false), 120);
        },
        off: (note, at) => midiRef.current.releaseKey(`midi${note}`, at),
        devices: (names) => setMidiState({ on: true, names, error: "" }),
      });
      store("ds-midi", "1");
    } catch {
      setMidiState({ on: false, names: [], error: "Il browser non ha dato il permesso per il MIDI" });
    }
  }, [keysRef]);
  useEffect(() => {
    setMidiOk(midiSupported());
    // permesso già dato in una visita precedente: mi ricollego da solo
    if (midiSupported() && stored("ds-midi") === "1") void midiGranted().then((ok) => {
        if (ok) void startMidi();
      });
    return () => midiStop.current?.();
  }, [startMidi]);
  return (
    <button
      type="button"
      className="hw-btn hw-btn--small hw-midi"
      aria-pressed={midiState.on}
      data-hit={midiHit}
      disabled={!midiOk}
      title={
        !midiOk
          ? "Questo browser non legge le tastiere MIDI: usa Chrome o Edge"
          : midiState.error ||
            (midiState.on
              ? midiState.names.length
                ? `Collegata: ${midiState.names.join(", ")}. Nel Roll suona lo strumento; altrove i tasti bassi suonano la batteria.`
                : "MIDI acceso: collega una tastiera USB"
              : "Collega una tastiera MIDI (USB): suoni e registri con lunghezza e forza dei tasti")
      }
      onClick={() => void startMidi()}
    >
      <span className="hw-btn-led" />
      MIDI{midiState.on && midiState.names.length ? ` ${midiState.names.length}` : ""}
    </button>
  );
}
