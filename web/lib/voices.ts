// Le voci ElevenLabs del coach (italiane, colloquiali). Gli id vengono dalla libreria di ElevenLabs:
// le voci "libreria" vanno aggiunte a My Voices nell'account ElevenLabs se l'API le rifiuta.
export const VOICES = [
  { id: "QITiGyM4owEZrBEf0QV8", name: "Ginevra", hint: "calda e naturale" },
  { id: "GcAgjAjkhWsmUd4GlPiv", name: "Marco", hint: "profondo e calmo" },
  { id: "MuTiG4dbrEGYEy3XP4iP", name: "Rossana", hint: "conversazionale" },
  { id: "0LVgsGv7iIw8nIYdxLEw", name: "Leonardo", hint: "giovane, alla mano" },
  { id: "ERE9g4sDsfBwzFT0GvPh", name: "Andrea", hint: "rilassato" },
  { id: "ZkghUkL4ZyogQtQ5KFG8", name: "CoachD", hint: "educatore" },
] as const;

export const DEFAULT_VOICE = VOICES[0].id;
export const isVoice = (id: unknown): id is string => VOICES.some((v) => v.id === id);
