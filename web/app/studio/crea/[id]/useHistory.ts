import { useCallback, useRef, useState } from "react";
import type { Project } from "@/lib/daw/project";

// Annulla / Ripeti: una pila dei progetti di prima (come i fogli di un blocco). Ogni modifica mette sopra il foglio di
// com'era prima; Ctrl+Z lo riprende, Ripeti lo rimette. Le modifiche fatte di seguito in meno di mezzo secondo (un
// trascinamento, un fader che scorre) diventano un passo solo. La pila vive finché lo studio è aperto.
export function useHistory(projectRef: { current: Project }, setProject: (p: Project) => void) {
  const past = useRef<Project[]>([]);
  const future = useRef<Project[]>([]);
  const lastEdit = useRef(0);
  const [hist, setHist] = useState({ undo: 0, redo: 0 });
  const syncHist = useCallback(() => setHist({ undo: past.current.length, redo: future.current.length }), []);
  // force: un passo a sé (il coach, una versione ripristinata), mai unito alle modifiche vicine
  const remember = useCallback(
    (force = false) => {
      const now = performance.now();
      if (force || now - lastEdit.current > 450) {
        past.current.push(projectRef.current);
        if (past.current.length > 100) past.current.shift();
        future.current = [];
        syncHist();
      }
      lastEdit.current = force ? 0 : now;
    },
    [syncHist, projectRef],
  );
  const undoEdit = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(projectRef.current);
    lastEdit.current = 0;
    setProject(prev);
    syncHist();
  }, [syncHist, projectRef, setProject]);
  const redoEdit = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(projectRef.current);
    lastEdit.current = 0;
    setProject(next);
    syncHist();
  }, [syncHist, projectRef, setProject]);

  return { lastEdit, hist, remember, undoEdit, redoEdit };
}
