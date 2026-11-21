import { TEMPLATES, type TemplateId } from "./templates";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// Crea un progetto da un modello (templates.ts; di base "House", il groove di partenza) per l'utente loggato (la RLS
// mette owner_id); restituisce l'id.
export async function createStarterProject(supabase: Supabase, modello: TemplateId = "house"): Promise<string | null> {
  const t = TEMPLATES[modello];
  const p = t.make();
  const day = new Date().toLocaleDateString("it-IT", { day: "numeric", month: "short", timeZone: "Europe/Rome" });
  const title = modello === "house" || modello === "vuoto" ? `Idea del ${day}` : `${t.label} · ${day}`;
  const { data, error } = await supabase.from("projects").insert({ title, bpm: p.bpm, data: p }).select("id").single();
  if (error) {
    console.error("nuovo progetto", error.message);
    return null;
  }
  return data.id as string;
}
