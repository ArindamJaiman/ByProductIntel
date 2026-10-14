import "server-only";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { dataMode } from "./config";
import { demoRepository } from "./repository/demo";
import { supabaseRepository } from "./repository/supabase";
import type { Actor, Repository } from "./repository/types";
import { createSupabaseServerClient } from "./supabase/client";

export interface RequestContext {
  mode: "demo" | "supabase";
  repo: Repository;
  actor: Actor | null;
}

const DEMO_ACTOR: Actor = { id: "demo-user", label: "Demo user", organisationId: "org-demo-user" };

/**
 * Resolve the repository and the acting user for this request. Deduplicated
 * per request with React.cache. Always waits for a real request so mutable
 * data is never baked into a prerendered shell.
 */
export const getContext = cache(async (): Promise<RequestContext> => {
  await connection();
  if (dataMode() === "demo") return { mode: "demo", repo: demoRepository, actor: DEMO_ACTOR };

  const db = await createSupabaseServerClient();
  const { data } = await db.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return { mode: "supabase", repo: supabaseRepository(db), actor: null };
  // Organisation membership is read from the server-side profile, never from the client.
  const { data: profile } = await db.from("profiles").select("organisation_id, display_name").eq("id", userId).maybeSingle();
  const actor: Actor | null = profile
    ? { id: userId, label: profile.display_name ?? String(data.claims.email ?? "Signed-in user"), organisationId: String(profile.organisation_id) }
    : null;
  return { mode: "supabase", repo: supabaseRepository(db), actor };
});

/** For pages: in persistent mode, send signed-out users (or users without a profile) to sign in. */
export async function requireContext(): Promise<RequestContext & { actor: Actor }> {
  const ctx = await getContext();
  if (!ctx.actor) redirect("/login");
  return ctx as RequestContext & { actor: Actor };
}
