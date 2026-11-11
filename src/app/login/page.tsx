import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { readAuthConfig } from "@/lib/auth/policy";
import { AuthCard } from "@/components/auth/auth-controls";
import Link from "next/link";
import { optionalPageSession } from "@/lib/auth/server";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; mode?: string }>;
}) {
  const config = readAuthConfig(process.env);
  if (config && (await headers()).get("host") !== new URL(config.baseURL).host)
    redirect(`${config.baseURL}/login`);
  if (await optionalPageSession()) redirect("/home");
  const { error, mode } = await searchParams;

  return (
    <main id="main" className="login-page">
      <Link
        href="/"
        className="login-brand"
        aria-label="LedgerOne public dashboard"
      >
        Ledger<span>One</span>
      </Link>
      <AuthCard
        config={
          config
            ? {
                configuredProviders: config.configuredProviders,
                available: true,
              }
            : null
        }
        initialMode={mode === "signup" ? "signup" : "login"}
        initialError={error}
      />
      <p className="mt-6 text-center text-sm text-muted-foreground">
        <Link href="/" className="underline underline-offset-4">
          Back to public dashboard
        </Link>
      </p>
    </main>
  );
}
