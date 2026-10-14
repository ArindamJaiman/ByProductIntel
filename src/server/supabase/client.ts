import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabasePublicConfig } from "../config";

/**
 * Per-request Supabase client bound to the user's session cookies. Uses the
 * publishable key only; the secret/service-role key is never used here and
 * never reaches the browser.
 */
export async function createSupabaseServerClient() {
  const { url, key } = supabasePublicConfig();
  const cookieStore = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(toSet) {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component where cookies are read-only; the proxy refreshes sessions.
        }
      },
    },
  });
}
