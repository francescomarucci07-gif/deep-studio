import { starterProject } from "./project";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// Crea un progetto con il groove di partenza per l'utente loggato (la RLS mette owner_id); restituisce l'id.
export async function createStarterProject(supabase: Supabase): Promise<string | null> {
  const p = starterProject();
  const day = new Date().toLocaleDateString("it-IT", { day: "numeric", month: "short" });
  const { data, error } = await supabase
    .from("projects")
    .insert({ title: `Idea del ${day}`, bpm: p.bpm, data: p })
    .select("id")
    .single();
  if (error) {
    console.error("nuovo progetto", error.message);
    return null;
  }
  return data.id as string;
}
