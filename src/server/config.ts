import "server-only";

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}

export type DataMode = "demo" | "supabase";

/**
 * Operating mode:
 *  - BPI_DATA_MODE=demo forces demo mode.
 *  - BPI_DATA_MODE=supabase requires Supabase configuration and fails loudly without it.
 *  - Otherwise Supabase is used when both public Supabase variables are set; demo mode if not.
 */
export function dataMode(): DataMode {
  const requested = process.env.BPI_DATA_MODE;
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  if (requested === "demo") return "demo";
  if (requested === "supabase" && !configured) {
    throw new ConfigurationError(
      "BPI_DATA_MODE is 'supabase' but NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are not both set. Set them in .env.local or remove BPI_DATA_MODE to use demo mode.",
    );
  }
  return configured ? "supabase" : "demo";
}

export function supabasePublicConfig(): { url: string; key: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new ConfigurationError("Supabase is not configured.");
  return { url, key };
}
