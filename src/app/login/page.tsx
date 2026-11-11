import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { LockKeyhole } from "lucide-react";
import { readAuthConfig } from "@/lib/auth/policy";
import { GoogleSignIn } from "@/components/auth/auth-controls";
import { Card } from "@/components/ui/card";
export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const config = readAuthConfig(process.env);
  if (config && (await headers()).get("host") !== new URL(config.baseURL).host)
    redirect(`${config.baseURL}/login`);
  const { error } = await searchParams;
  return (
    <main id="main" className="login-page">
      <div className="login-brand">
        Ledger<span>One</span>
      </div>
      <Card className="login-card">
        <span className="section-icon mb-6">
          <LockKeyhole aria-hidden="true" />
        </span>
        <p className="eyebrow">YOUR PRIVATE WORKSPACE</p>
        <h1>A clearer view starts here.</h1>
        <p className="page-description mb-7">
          Sign in with your approved Google account to open LedgerOne.
        </p>
        {error && (
          <p role="alert" className="notice notice-error mb-5">
            Sign-in wasn’t completed. Please use your approved account and try
            again.
          </p>
        )}
        {!config && (
          <p role="status" className="notice mb-5">
            Sign-in is not available on this installation yet. The workspace
            owner needs to finish setup.
          </p>
        )}
        <GoogleSignIn available={!!config} />
        <p className="mt-5 text-sm text-muted-foreground">
          Access is limited to approved identities. There is no public
          registration.
        </p>
      </Card>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Your money. A little clearer.
      </p>
    </main>
  );
}
