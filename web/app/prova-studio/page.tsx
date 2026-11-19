import { notFound } from "next/navigation";
import { normalize, starterProject } from "@/lib/daw/project";
import user from "@/tests/e2e/progetto-utente.json";
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
  const hits = (...at: number[]) => Array.from({ length: 16 }, (_, i) => at.includes(i));
  const data =
    p === "empty"
      ? normalize({ version: 2, bpm: 120, swing: 0 })
      : p === "user"
        ? normalize(user)
        : p === "export"
          ? normalize({ ...starter, bpm: 120, swing: 0, patterns: { ...starter.patterns, A: { ...starter.patterns.A, drums: { ...starter.patterns.A.drums, tom: hits(12, 14), shaker: hits(1, 3, 5, 7) }, lead, len: { "l0:72": 4 }, vel: { hat2: 0.4 } } } })
          : starter;
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
