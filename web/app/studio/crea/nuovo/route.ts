import { NextResponse, type NextRequest } from "next/server";
import { starterProject } from "@/lib/daw/project";
import { createClient } from "@/lib/supabase/server";

// Crea un progetto con il groove di partenza e apre lo studio. È un POST (da un form):
// così il prefetch dei link non crea progetti vuoti a caso.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/accedi", request.url), 303);

  const p = starterProject();
  const day = new Date().toLocaleDateString("it-IT", { day: "numeric", month: "short" });
  const { data, error } = await supabase
    .from("projects")
    .insert({ title: `Idea del ${day}`, bpm: p.bpm, data: p })
    .select("id")
    .single();
  if (error) {
    console.error("nuovo progetto", error.message);
    return NextResponse.redirect(new URL("/studio?errore=progetto", request.url), 303);
  }
  return NextResponse.redirect(new URL(`/studio/crea/${data.id}`, request.url), 303);
}
