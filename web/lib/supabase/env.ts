// URL e anon key arrivano da web/.env.local (in locale) o dalle variabili di Vercel.
// La anon key è pubblica per definizione: la sicurezza la fa la row-level security.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export function hasSupabase() {
  return SUPABASE_URL !== "" && SUPABASE_ANON_KEY !== "";
}
