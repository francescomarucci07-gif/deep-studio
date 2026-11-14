import { NextResponse, type NextRequest } from "next/server";
import { createStarterProject } from "@/lib/daw/new-project";
import { createClient } from "@/lib/supabase/server";

// Crea un progetto con il groove di partenza e apre lo studio. È un POST (da un form):
// così il prefetch dei link non crea progetti vuoti a caso.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/accedi", request.url), 303);

  const id = await createStarterProject(supabase);
  if (!id) return NextResponse.redirect(new URL("/studio?errore=progetto", request.url), 303);
  return NextResponse.redirect(new URL(`/studio/crea/${id}`, request.url), 303);
}
