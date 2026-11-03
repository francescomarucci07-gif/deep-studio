"use client";

import { CoachChat, type Msg } from "@/components/CoachChat";

export function AnalysisCoach({
  versionId,
  initial,
  hasPrevious,
  hasVocals,
}: {
  versionId: string;
  initial: Msg[];
  hasPrevious: boolean;
  hasVocals: boolean;
}) {
  const suggestions = [
    "Cosa sistemo per primo?",
    "Spiegami il low end",
    ...(hasVocals ? ["La voce ha bisogno di autotune?", "Come tolgo le S che pungono?"] : []),
    ...(hasPrevious ? ["Cosa è migliorato rispetto alla versione prima?"] : []),
  ];
  return (
    <CoachChat
      endpoint="/api/coach"
      payload={() => ({ versionId })}
      initial={initial}
      suggestions={suggestions}
      intro="Chiedimi cosa cambiare in questo mix, come farlo in FL Studio e perché funziona. Puoi scrivere o parlare."
      hint="Il coach vede le misure, non ascolta l’audio. Applica la modifica in FL, esporta e carica la nuova versione: ti dice cosa è cambiato."
    />
  );
}
