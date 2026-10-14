import Link from "next/link";
import { buttonStyles } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <p className="text-sm text-ink-3">Not found</p>
        <h1 className="wide mt-1 text-2xl font-bold">That record does not exist or is not visible to you.</h1>
        <p className="mt-2 text-ink-2">It may have been removed, or the link may be incomplete.</p>
        <Link href="/dashboard" className={`${buttonStyles.primary} mt-6`}>Go to the dashboard</Link>
      </div>
    </main>
  );
}
