"use client";

// Cronologia del progetto: "fotografie" salvate in project_versions (RLS: solo le tue).
import { createClient } from "@/lib/supabase/client";
import type { Project } from "./project";

export type Version = { id: string; title: string; label: string; created_at: string };

export const AUTO_EVERY_MS = 10 * 60 * 1000; // una fotografia automatica ogni 10 minuti di lavoro

export async function saveVersion(projectId: string, title: string, data: Project, label: string) {
  const { error } = await createClient()
    .from("project_versions")
    .insert({ project_id: projectId, title: title.trim() || "Senza titolo", label: label.slice(0, 120), data });
  if (error) console.error("versione", error.message);
  return !error;
}

export async function listVersions(projectId: string) {
  const { data } = await createClient()
    .from("project_versions")
    .select("id, title, label, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(60);
  return (data ?? []) as Version[];
}

export async function loadVersion(id: string) {
  const { data } = await createClient().from("project_versions").select("title, data").eq("id", id).maybeSingle();
  return data as { title: string; data: unknown } | null;
}
