// La tastiera MIDI (Web MIDI del browser: Chrome, Edge, Opera; Safari no). Niente librerie: il browser ci dà i
// messaggi grezzi, 3 numeri per ogni tasto. Il primo dice cosa succede (0x90 = tasto giù, 0x80 = tasto su; un
// "tasto giù" con forza 0 vale come "tasto su"), il secondo quale nota (60 = Do4), il terzo quanto forte (1–127).

import type { DrumId } from "./project";

export type MidiHandlers = {
  on: (note: number, velocity: number, at: number) => void; // at: event.timeStamp, come i tasti del computer
  off: (note: number, at: number) => void;
  devices: (names: string[]) => void; // cambia l'elenco delle tastiere collegate
};

export const midiSupported = () => typeof navigator !== "undefined" && "requestMIDIAccess" in navigator;

// Il permesso è già stato dato? (allora ci si ricollega da soli, senza chiedere di nuovo)
export async function midiGranted(): Promise<boolean> {
  try {
    const st = await navigator.permissions.query({ name: "midi" as PermissionName });
    return st.state === "granted";
  } catch {
    return false;
  }
}

// Collega tutte le tastiere MIDI (anche quelle attaccate dopo). Restituisce la funzione per staccarle.
export async function connectMidi(h: MidiHandlers): Promise<() => void> {
  const access = await navigator.requestMIDIAccess({ sysex: false });
  const listen = (e: MIDIMessageEvent) => {
    const d = e.data;
    if (!d || d.length < 3) return;
    const kind = d[0] & 0xf0; // il canale MIDI (i 4 bit bassi) non conta: ascoltiamo tutti e 16
    if (kind === 0x90 && d[2] > 0) h.on(d[1], d[2], e.timeStamp);
    else if (kind === 0x80 || (kind === 0x90 && d[2] === 0)) h.off(d[1], e.timeStamp);
  };
  const attach = () => {
    const names: string[] = [];
    access.inputs.forEach((input) => {
      input.onmidimessage = listen;
      if (input.state === "connected") names.push(input.name || "Tastiera MIDI");
    });
    h.devices(names);
  };
  attach();
  access.onstatechange = attach;
  return () => {
    access.onstatechange = null;
    access.inputs.forEach((input) => (input.onmidimessage = null));
    h.devices([]);
  };
}

// I pad di batteria con la mappa General MIDI (quella dei 16 pad dei controller, 36–51): 35/36 kick, 37–40 rullante e
// clap, 42 hat chiuso, 44 (pedal hat, un "chick" corto) shaker, 46 hat aperto, i tom (41, 43, 45, 47, 48, 50) sul tom,
// piatti (49, 51) sulla perc. Fuori da 35–51 niente: chi suona una tastiera intera fuori dal Roll non fa casino.
const TOMS = [41, 43, 45, 47, 48, 50];
export function gmDrum(note: number): DrumId | null {
  if (note === 35 || note === 36) return "kick";
  if (note >= 37 && note <= 40) return "clap";
  if (note === 42) return "hat";
  if (note === 44) return "shaker";
  if (note === 46) return "openhat";
  if (TOMS.includes(note)) return "tom";
  if (note === 49 || note === 51) return "perc";
  return null;
}
