// Il parere in tempo reale: durante il Play misura il mix ogni 100 ms (Engine.listenFrame) e passa le misure alle
// regole di listen.ts. Quando trova un problema restituisce l'avviso da mostrare. "Non dirmelo più" vale per sempre in
// questo browser (ds-ascolto-no).
import { useCallback, useEffect, useRef, useState } from "react";
import type { Engine } from "@/lib/daw/engine";
import { type Issue, type IssueId, Listener } from "@/lib/daw/listen";
import { store, stored } from "./ui";

const KEY = "ds-ascolto-no";
const EVERY_MS = 100;

function readMuted(): Set<IssueId> {
  try {
    const v = JSON.parse(stored(KEY) ?? "[]");
    return new Set(Array.isArray(v) ? v : []);
  } catch {
    return new Set();
  }
}

export function useAscolto(engineRef: { current: Engine | null }, playing: boolean) {
  const [notice, setNotice] = useState<Issue | null>(null);
  const shown = useRef(false); // c'è un avviso aperto
  shown.current = notice !== null;
  const muted = useRef<Set<IssueId>>(new Set());
  const listener = useRef<Listener | null>(null);
  useEffect(() => {
    muted.current = readMuted();
    listener.current = new Listener(() => muted.current);
  }, []);

  useEffect(() => {
    const l = listener.current;
    const e = engineRef.current;
    if (!playing || !l || !e) return;
    l.reset(); // ogni Play riparte da capo: niente misure di un mix di prima
    const t = setInterval(() => {
      try {
        const issue = l.push(e.listenFrame(), Date.now(), !shown.current);
        if (issue) setNotice(issue);
      } catch {
        // analizzatori non disponibili (browser vecchio): niente avvisi
      }
    }, EVERY_MS);
    return () => clearInterval(t);
  }, [playing, engineRef]);

  const dismiss = useCallback(() => setNotice(null), []);
  const never = useCallback((id: IssueId) => {
    muted.current.add(id);
    store(KEY, JSON.stringify([...muted.current]));
    setNotice(null);
  }, []);
  return { notice, dismiss, never, summary: () => listener.current?.summary() ?? null };
}
