// Separa il testo del coach dai dati per lo studio (un pattern da applicare), nello stesso stream.
export const DATA_MARK = "\u001e";

// Il coach a volte scrive in markdown anche se gli chiediamo di non farlo: in chat e in voce
// mostriamo solo il testo, senza asterischi, cancelletti o backtick.
export function plainText(s: string) {
  return s
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*`#]/g, "")
    .trim();
}
