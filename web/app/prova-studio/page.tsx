import { notFound } from "next/navigation";
import { normalize, starterProject } from "@/lib/daw/project";
import user from "@/tests/e2e/progetto-utente.json";
import { TEMPLATES, isTemplate } from "@/lib/daw/templates";
import { Player } from "../ascolta/[codice]/Player";
import { ProjectActions } from "../studio/ProjectActions";
import { Daw } from "../studio/crea/[id]/Daw";

// La pagina dei test nel browser (Playwright, tests/e2e): lo studio senza login né database, con un progetto scelto
// da ?p=. Esiste solo quando i test la accendono con DS_PROVA=1; sul sito vero risponde "pagina non trovata".
export const dynamic = "force-dynamic";

export default async function ProvaStudio({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  if (process.env.DS_PROVA !== "1") notFound();
  const { p = "starter" } = await searchParams;
  const starter = starterProject();
  const lead = Array.from({ length: 16 }, () => [] as number[]);
  lead[0] = [72];
  const lead2 = Array.from({ length: 16 }, () => [] as number[]);
  lead2[8] = [79];
  const hits = (...at: number[]) => Array.from({ length: 16 }, (_, i) => at.includes(i));
  const data =
    p === "empty"
      ? normalize({ version: 2, bpm: 120, swing: 0 })
      : p === "user"
        ? normalize(user)
        : p === "export"
          ? normalize({ ...starter, bpm: 120, swing: 0, patterns: { ...starter.patterns, A: { ...starter.patterns.A, drums: { ...starter.patterns.A.drums, tom: hits(12, 14), shaker: hits(1, 3, 5, 7) }, lead, lead2, len: { "l0:72": 4 }, vel: { hat2: 0.4 } } } })
          : p === "pesto"
            ? // un mix sbagliato apposta (per il parere in tempo reale): basso lungo e forte sulle stesse note del kick,
              // sidechain spento, tutto al massimo, hat fitti e accordi scuri
              normalize({
                ...starter,
                sidechain: false,
                bassSound: { wave: "sub", cutoff: 400, length: "lunga" },
                patterns: {
                  ...starter.patterns,
                  A: {
                    ...starter.patterns.A,
                    drums: { ...starter.patterns.A.drums, hat: hits(...Array.from({ length: 16 }, (_, i) => i)) },
                    bass: Array.from({ length: 16 }, (_, i) => (i % 4 === 0 ? 33 : null)),
                  },
                },
                mixer: Object.fromEntries(Object.entries(starter.mixer).map(([k, c]) => [k, { ...c, volume: 1 }])),
              })
            : p === "send"
              ? // solo il lead suona, ma la sua uscita è un bus muto: si sente solo se il send verso bus3 funziona
                normalize({
                  ...starter,
                  bpm: 120,
                  patterns: { ...starter.patterns, A: { ...starter.patterns.A, lead } },
                  fx: { ...starter.fx, lead: { filter: 0, reverb: 0, delay: 0 } }, // niente riverbero e delay: vanno dritti al master
                  mixer: Object.fromEntries(
                    Object.entries(starter.mixer).map(([k, c]) => [k, k === "lead" ? { ...c, out: "bus2", sends: { bus3: 1 } } : { ...c, muted: true }]),
                  ),
                  buses: { ...starter.buses, bus2: { ...starter.buses.bus2, name: "Muto", muted: true, shown: true }, bus3: { ...starter.buses.bus3, name: "Rev", shown: true } },
                })
              : starter;
  // le azioni sui progetti della pagina Il tuo studio
  if (p === "progetti") return <ProjectActions id="00000000-0000-0000-0000-000000000002" title="Groove di prova" />;
  // un progetto modello (?p=modello-deep, modello-tech…)
  const modello = p.startsWith("modello-") ? p.slice(8) : null;
  if (modello && isTemplate(modello))
    return <Daw id="prova" initialTitle={TEMPLATES[modello].label} initialProject={TEMPLATES[modello].make()} coachMessages={[]} tourDone />;
  // il lettore del link di ascolto (/ascolta/<codice>) con la traccia di prova, senza database
  if (p === "ascolta")
    return <Player codice="codicediprova12345678" title="Prova ascolto" project={normalize({ ...starter, bpm: 140 })} updatedAt="2026-11-20T10:00:00Z" />;
  return (
    <Daw
      id={p === "segnala" ? "00000000-0000-0000-0000-000000000001" : "prova"}
      initialTitle={p === "export" ? "Prova export" : "Prova"}
      initialProject={data}
      coachMessages={[]}
      tourDone={p !== "tour"}
    />
  );
}
