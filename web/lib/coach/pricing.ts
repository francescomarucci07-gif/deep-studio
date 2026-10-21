// Dollari per milione di token (listino Anthropic, ott 2026). Serve a registrare il costo di ogni
// risposta del coach in coach_messages, come chiede CLAUDE.md ("Costi" dal primo giorno).
const PRICES: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
};

export function costUsd(
  model: string,
  u: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null },
) {
  const p = PRICES[model];
  if (!p) return null;
  return (
    (u.input_tokens * p.input +
      u.output_tokens * p.output +
      (u.cache_read_input_tokens ?? 0) * p.cacheRead +
      (u.cache_creation_input_tokens ?? 0) * p.cacheWrite) /
    1e6
  );
}
