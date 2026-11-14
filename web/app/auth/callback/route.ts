import { NextResponse, type NextRequest } from "next/server";
import { createStarterProject } from "@/lib/daw/new-project";
import { createClient } from "@/lib/supabase/server";

// Il link magico porta qui con un "code": lo scambiamo con la sessione (cookie) e andiamo avanti.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/studio";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/studio";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Prima volta (nessun progetto, tour mai visto): apro subito un progetto nuovo, dove parte il tour guidato
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user && user.user_metadata?.tour_done !== true && safeNext === "/studio") {
        const { count } = await supabase.from("projects").select("id", { count: "exact", head: true });
        if (count === 0) {
          const id = await createStarterProject(supabase);
          if (id) return NextResponse.redirect(`${origin}/studio/crea/${id}`);
        }
      }
      return NextResponse.redirect(`${origin}${safeNext}`);
    }
  }
  return NextResponse.redirect(`${origin}/accedi?errore=link`);
}
