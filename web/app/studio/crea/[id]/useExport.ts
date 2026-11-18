import { useEffect, useState } from "react";
import { projectToMidi } from "@/lib/daw/midifile";
import type { ChannelId, Project, Slot } from "@/lib/daw/project";
import { encodeWav, renderAudio, renderPlan } from "@/lib/daw/render";
import { storeZip } from "@/lib/daw/zip";
import { CHANNELS } from "./ui";

type ExportArgs = {
  projectRef: { current: Project };
  titleRef: { current: string };
  songMode: boolean;
  editing: Slot;
  setExporting: (s: "no" | "sì" | "errore") => void;
  onDone: () => void; // un export riuscito (serve all'ultima lezione)
};

// Export: il mix in WAV, gli stem (un WAV per strumento, in uno zip) o le note in MIDI, da portare in FL Studio.
export function useExport({ projectRef, titleRef, songMode, editing, setExporting, onDone }: ExportArgs) {
  const [exportMenu, setExportMenu] = useState(false);
  const [exportMsg, setExportMsg] = useState("");
  const fileBase = () => {
    const name = (titleRef.current.trim() || "deep-studio").replace(/[^\p{L}\p{N} _-]+/gu, "").trim() || "deep-studio";
    return `${name}${songMode ? "" : ` - pattern ${editing}`}`;
  };
  const download = (blob: Blob, file: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };
  // il menu si chiude con un clic fuori o con Esc
  useEffect(() => {
    if (!exportMenu) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !(e.target as HTMLElement).closest(".hw-export")) setExportMenu(false);
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", close);
    };
  }, [exportMenu]);
  const exportWhat = () => (songMode ? ({ song: true } as const) : ({ song: false, slot: editing } as const));
  const runExport = async (job: () => Promise<void>) => {
    setExportMenu(false);
    setExporting("sì");
    try {
      await job();
      setExporting("no");
      onDone();
    } catch (e) {
      console.error("export", e);
      setExporting("errore");
    } finally {
      setExportMsg("");
    }
  };
  const exportWav = () =>
    runExport(async () => download(encodeWav(await renderAudio(projectRef.current, exportWhat())), `${fileBase()}.wav`));
  // gli stem: solo gli strumenti che suonano davvero (non muti e con almeno un colpo o una nota nell'export)
  const exportStems = () =>
    runExport(async () => {
      const p = projectRef.current;
      const pats = [...new Set(renderPlan(p, exportWhat()).filter((x): x is Slot => x !== null))].map((x) => p.patterns[x]);
      const plays = (c: ChannelId) =>
        !p.mixer[c].muted &&
        pats.some((pt) =>
          c === "bass" ? pt.bass.some((n) => n !== null) : c === "lead" ? pt.lead.some((n) => n.length) : c === "chords" ? pt.chords.some((x) => x.length) : pt.drums[c].some(Boolean),
        );
      const list = CHANNELS.filter((c) => plays(c.id));
      const files: { name: string; data: Uint8Array }[] = [];
      for (const [k, c] of list.entries()) {
        setExportMsg(`Stem ${k + 1}/${list.length}`);
        const wav = encodeWav(await renderAudio(p, exportWhat(), c.id));
        files.push({ name: `${String(k + 1).padStart(2, "0")} ${c.label}.wav`, data: new Uint8Array(await wav.arrayBuffer()) });
      }
      download(storeZip(files), `${fileBase()} - stem.zip`);
    });
  const exportMidi = () =>
    runExport(async () => {
      const p = projectRef.current;
      download(new Blob([projectToMidi(p, renderPlan(p, exportWhat()))], { type: "audio/midi" }), `${fileBase()}.mid`);
    });

  return { exportMenu, setExportMenu, exportMsg, exportWav, exportStems, exportMidi };
}
