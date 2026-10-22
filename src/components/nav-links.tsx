"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { cx } from "./ui";

export const NAV_GROUPS = [
  {
    label: "Overview",
    items: [
      { href: "/dashboard", label: "Dashboard" },
      { href: "/portfolio", label: "Group portfolio" },
    ],
  },
  {
    label: "Registry",
    items: [
      { href: "/materials", label: "Materials" },
      { href: "/applications", label: "Applications" },
    ],
  },
  {
    label: "Analysis",
    items: [
      { href: "/match", label: "Matching workspace" },
      { href: "/test-plan", label: "Test planner" },
      { href: "/scenarios", label: "Scenarios" },
    ],
  },
  { label: "Review", items: [{ href: "/shortlist", label: "Shortlist" }] },
  {
    label: "Reference",
    items: [
      { href: "/evidence", label: "Evidence library" },
      { href: "/methodology", label: "Methodology" },
    ],
  },
] as const;

export function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  return <NavList pathname={usePathname()} onNavigate={onNavigate} />;
}

/** Hook-free list, also used as the Suspense fallback while the pathname resolves. */
export function NavList({ pathname, onNavigate }: { pathname: string | null; onNavigate?: () => void }) {
  return (
    <nav aria-label="Main">
      {NAV_GROUPS.map((g) => (
        <div key={g.label} className="mb-4">
          <div className="mb-1 px-3 text-xs text-ink-3">{g.label}</div>
          <ul>
            {g.items.map((item) => {
              const active = pathname !== null && (pathname === item.href || pathname.startsWith(`${item.href}/`));
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cx(
                      "block border-l-2 px-3 py-1.5 text-[0.93rem]",
                      active ? "border-copper bg-panel font-semibold text-ink" : "border-transparent text-ink-2 hover:border-rule-strong hover:text-ink",
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function MobileNav() {
  return (
    <details className="group relative md:hidden">
      <summary className="cursor-pointer list-none border border-rule-strong bg-panel px-3 py-1.5 text-sm font-semibold [&::-webkit-details-marker]:hidden">
        Menu
      </summary>
      <div className="absolute right-0 z-40 mt-2 w-64 border border-rule-strong bg-ground p-3 shadow-[0_8px_24px_rgba(30,33,36,0.18)]">
        <Suspense fallback={<NavList pathname={null} />}>
          <NavLinks
            onNavigate={() => {
              document.querySelectorAll("details[open]").forEach((d) => d.removeAttribute("open"));
            }}
          />
        </Suspense>
      </div>
    </details>
  );
}
