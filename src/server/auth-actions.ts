"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { dataMode } from "./config";
import { createSupabaseServerClient } from "./supabase/client";

export interface LoginState {
  error?: string;
}

const credentials = z.object({
  email: z.string().trim().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});

export async function signInAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  if (dataMode() !== "supabase") redirect("/dashboard");
  const parsed = credentials.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const db = await createSupabaseServerClient();
  const { error } = await db.auth.signInWithPassword(parsed.data);
  if (error) return { error: "Sign-in failed. Check your email and password." };
  redirect("/dashboard");
}

export async function signOutAction(): Promise<void> {
  if (dataMode() === "supabase") {
    const db = await createSupabaseServerClient();
    await db.auth.signOut();
  }
  redirect("/login");
}
