import { Suspense } from "react";
import { Brand } from "@/components/brand";
import { MobileNav, NavLinks, NavList } from "@/components/nav-links";
import { getContext } from "@/server/context";
import { ConfigurationError } from "@/server/config";

async function ModeStrip() {
  let text: string;
  let tone = "bg-copper-wash text-copper-deep";
  try {
    const { mode, repo, actor } = await getContext();
    if (mode === "demo") {
      text =
        repo.persistence === "memory"
          ? "Demo mode: synthetic data, saved only in server memory (the file store is not writable here). Changes are lost on restart."
          : "Demo mode: synthetic data stored in a local file. Nothing is sent to a database.";
    } else {
      text = actor ? `Persistent mode: signed in as ${actor.label}. Data is stored in Supabase.` : "Persistent mode: not signed in.";
      tone = "bg-verdigris-wash text-verdigris";
    }
  } catch (e) {
    text = e instanceof ConfigurationError ? `Configuration error: ${e.message}` : "Could not determine the operating mode.";
    tone = "bg-oxide-wash text-oxide";
  }
  return <p className={`px-4 py-1.5 text-xs font-medium md:px-8 ${tone}`}>{text} Decision-support prototype; not an approval of any material.</p>;
}

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-panel focus:p-2">
        Skip to content
      </a>
      <Suspense fallback={<p className="h-7 bg-copper-wash" aria-hidden />}>
        <ModeStrip />
      </Suspense>
      <div className="flex flex-1">
        <aside className="hidden w-60 shrink-0 border-r border-rule bg-panel-sunk px-3 py-5 md:block">
          <div className="mb-7 px-3">
            <Brand href="/dashboard" />
          </div>
          <Suspense fallback={<NavList pathname={null} />}>
            <NavLinks />
          </Suspense>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-rule bg-panel-sunk px-4 py-3 md:hidden">
            <Brand href="/dashboard" />
            <MobileNav />
          </div>
          <main id="main" className="mx-auto w-full max-w-[1240px] flex-1 px-4 py-6 md:px-8 md:py-8">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
