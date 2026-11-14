import { notFound } from "next/navigation";
import type { Msg } from "@/components/CoachChat";
import { SupabaseMissing } from "@/components/SupabaseMissing";
import { normalize } from "@/lib/daw/project";
import { hasSupabase } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { Daw } from "./Daw";

export const dynamic = "force-dynamic";
export const metadata = { title: "Studio · Deep Studio" };

export default async function Crea({ params }: { params: Promise<{ id: string }> }) {
  if (!hasSupabase()) return <SupabaseMissing />;
  const { id } = await params;
  const supabase = await createClient();
  const { data: project } = await supabase.from("projects").select("id, title, data").eq("id", id).maybeSingle();
  if (!project) notFound(); // non esiste, oppure è di un altro utente (RLS)

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: msgs } = await supabase
    .from("coach_messages")
    .select("role, content")
    .eq("project_id", id)
    .order("created_at");

  return (
    <Daw
      id={project.id}
      initialTitle={project.title}
      initialProject={normalize(project.data)}
      coachMessages={(msgs ?? []) as Msg[]}
      tourDone={user?.user_metadata?.tour_done === true}
    />
  );
}
