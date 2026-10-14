import Link from "next/link";
import { Suspense } from "react";
import { Brand } from "@/components/brand";
import { LoginForm } from "@/components/login-form";
import { dataMode } from "@/server/config";
import { connection } from "next/server";

export const metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm border border-rule-strong bg-panel p-6">
        <Brand />
        <Suspense fallback={null}>
          <LoginBody />
        </Suspense>
      </div>
    </main>
  );
}

async function LoginBody() {
  await connection();
  if (dataMode() === "demo") {
    return (
      <div className="mt-6 space-y-3 text-sm">
        <p>The app is running in demo mode, so no sign-in is needed.</p>
        <Link href="/dashboard" className="font-semibold text-copper hover:underline">Open the demo workspace</Link>
      </div>
    );
  }
  return (
    <>
      <h1 className="wide mt-6 text-xl font-bold">Sign in</h1>
      <p className="mt-1 text-sm text-ink-2">Accounts are created by your administrator and linked to one organisation.</p>
      <LoginForm />
    </>
  );
}
