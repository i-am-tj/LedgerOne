"use client";

import { useState } from "react";
import {
  LogOut,
  LoaderCircle,
  KeyRound,
  Fingerprint,
  LockKeyhole,
  ChevronDown,
  ChevronUp,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import type { AuthProviderId } from "@/lib/auth/adapters";

export function GoogleIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" {...props}>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      />
    </svg>
  );
}

export function GitHubIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="currentColor"
      {...props}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
      />
    </svg>
  );
}

export function ChatGPTIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="currentColor"
      {...props}
    >
      <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.8956zm16.0993 3.8558L12.5973 8.3829l2.02-1.1686a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.4022-.6812zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813v6.7227zm1.145-2.0728l2.5485-1.4674 2.5484 1.4674v2.9348l-2.5484 1.4674-2.5485-1.4674z" />
    </svg>
  );
}

export function AppleIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="currentColor"
      {...props}
    >
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.38c.62-.75 1.04-1.8 1.01-2.85-.9.04-2.04.6-2.69 1.36-.57.65-1.07 1.72-1.02 2.76 1.01.08 2.06-.51 2.7-1.27z" />
    </svg>
  );
}

const EXPECTED_ORIGINS: Record<AuthProviderId, string> = {
  google: "https://accounts.google.com",
  github: "https://github.com",
};

export function SocialSignInButton({
  provider,
  available,
  label,
  icon: Icon,
}: {
  provider: AuthProviderId;
  available: boolean;
  label: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function signIn() {
    setPending(true);
    setError(false);
    try {
      const response = await fetch("/api/auth/sign-in/social", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          callbackURL: "/home",
          errorCallbackURL: "/login?error=signin",
        }),
      });
      const data = await response.json();
      const expectedOrigin = EXPECTED_ORIGINS[provider];
      if (
        !response.ok ||
        typeof data.url !== "string" ||
        new URL(data.url).origin !== expectedOrigin
      ) {
        throw new Error("Sign in unavailable");
      }
      window.location.assign(data.url);
    } catch {
      setPending(false);
      setError(true);
    }
  }

  return (
    <div>
      <Button
        onClick={signIn}
        disabled={!available || pending}
        variant="outline"
        className="w-full h-11 text-sm font-medium flex items-center justify-center gap-3 rounded-lg border hover:bg-muted/60 transition-colors"
        aria-busy={pending}
      >
        {pending ? (
          <LoaderCircle
            aria-hidden="true"
            className="loading-spinner h-4 w-4 animate-spin"
          />
        ) : (
          <Icon aria-hidden="true" className="shrink-0" />
        )}
        <span>
          {pending
            ? `Connecting to ${label.replace("Continue with ", "")}…`
            : label}
        </span>
      </Button>
      {error && (
        <p
          role="alert"
          className="notice notice-error mt-4 text-sm text-destructive"
        >
          Sign-in couldn’t start. Please try again.
        </p>
      )}
    </div>
  );
}

export function GoogleSignIn({ available }: { available: boolean }) {
  return (
    <SocialSignInButton
      provider="google"
      available={available}
      label="Continue with Google"
      icon={GoogleIcon}
    />
  );
}

export function GitHubSignIn({ available }: { available: boolean }) {
  return (
    <SocialSignInButton
      provider="github"
      available={available}
      label="Continue with GitHub"
      icon={GitHubIcon}
    />
  );
}

export function SignOutButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function signOut() {
    setPending(true);
    setError(false);
    try {
      const result = await fetch("/api/auth/sign-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!result.ok) throw new Error("Sign out failed");
      window.location.assign("/login");
    } catch {
      setPending(false);
      setError(true);
    }
  }

  return (
    <>
      <Button
        variant="outline"
        onClick={signOut}
        disabled={pending}
        aria-busy={pending}
        className="mt-3 w-full"
      >
        <LogOut aria-hidden="true" />
        {pending ? "Signing out…" : "Sign out"}
      </Button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          Couldn’t sign out. Please try again.
        </p>
      )}
    </>
  );
}

/**
 * High-fidelity auth template matching the modern Vercel/developer auth layout,
 * supporting both Sign In and Sign Up modes with Google and GitHub adapters.
 */
export function AuthCard({
  config,
  initialMode = "login",
  initialError,
}: {
  config: {
    configuredProviders: readonly AuthProviderId[];
    available: boolean;
  } | null;
  initialMode?: "login" | "signup";
  initialError?: string;
}) {
  const [mode, setMode] = useState<"login" | "signup">(initialMode);
  const [email, setEmail] = useState("");
  const [emailNotice, setEmailNotice] = useState("");
  const [showOtherOptions, setShowOtherOptions] = useState(false);

  const isSignUp = mode === "signup";
  const googleAvailable = Boolean(
    config?.configuredProviders.includes("google"),
  );
  const githubAvailable = Boolean(
    config?.configuredProviders.includes("github"),
  );

  function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) {
      setEmailNotice("Please enter your email address.");
      return;
    }
    setEmailNotice(
      "Direct email access is restricted. Please sign in with your approved Google or GitHub identity.",
    );
  }

  return (
    <Card className="login-card w-full max-w-[440px] mx-auto p-6 sm:p-10 rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex flex-col items-center text-center mb-6">
        <span className="section-icon mb-4">
          <LockKeyhole aria-hidden="true" />
        </span>
        <p className="eyebrow text-xs tracking-widest font-semibold text-primary uppercase mb-1">
          {isSignUp ? "YOUR FINANCIAL HOME" : "YOUR PRIVATE WORKSPACE"}
        </p>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
          {isSignUp
            ? "Your first deploy is just a sign-up away."
            : "A clearer view starts here."}
        </h1>
        <p className="page-description text-sm text-muted-foreground mt-2">
          {isSignUp
            ? "Create your workspace with your approved developer identity."
            : "Sign in with your approved Google or GitHub account to open LedgerOne."}
        </p>
      </div>

      {initialError && (
        <p
          role="alert"
          className="notice notice-error mb-5 text-sm p-3 rounded-lg bg-destructive/10 text-destructive border border-destructive/20"
        >
          Sign-in wasn’t completed. Please use your approved account and try
          again.
        </p>
      )}

      {!config && (
        <p
          role="status"
          className="notice mb-5 text-sm p-3 rounded-lg bg-muted text-muted-foreground border"
        >
          Sign-in is not available on this installation yet. The workspace owner
          needs to finish setup.
        </p>
      )}

      {/* In Login mode: Email Address input & Continue with Email (matching Image 2) */}
      {!isSignUp && (
        <form onSubmit={handleEmailSubmit} className="space-y-3 mb-5">
          <div className="space-y-1 text-left">
            <label htmlFor="login-email" className="sr-only">
              Email Address
            </label>
            <Input
              id="login-email"
              type="email"
              placeholder="Email Address"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setEmailNotice("");
              }}
              className="h-11 px-4 text-sm rounded-lg"
              autoComplete="email"
            />
          </div>
          <Button
            type="submit"
            className="w-full h-11 text-sm font-medium rounded-lg bg-foreground text-background hover:bg-foreground/90 transition-colors"
          >
            Continue with Email
          </Button>
          {emailNotice && (
            <p
              role="status"
              className="text-xs text-muted-foreground text-center"
            >
              {emailNotice}
            </p>
          )}

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">or</span>
            </div>
          </div>
        </form>
      )}

      {/* Social Providers Stack */}
      <div className="space-y-2.5">
        <SocialSignInButton
          provider="google"
          available={googleAvailable}
          label="Continue with Google"
          icon={GoogleIcon}
        />

        <SocialSignInButton
          provider="github"
          available={githubAvailable}
          label="Continue with GitHub"
          icon={GitHubIcon}
        />

        <Button
          type="button"
          variant="outline"
          onClick={() =>
            setEmailNotice(
              "ChatGPT sign-in is coming soon. Please use Google or GitHub.",
            )
          }
          className="w-full h-11 text-sm font-medium flex items-center justify-center gap-3 rounded-lg border hover:bg-muted/60 transition-colors"
        >
          <ChatGPTIcon aria-hidden="true" className="shrink-0" />
          <span>Continue with ChatGPT</span>
        </Button>

        {/* Collapsible extra options from templates */}
        {showOtherOptions && (
          <div className="space-y-2.5 pt-1 animate-in fade-in duration-200">
            {isSignUp ? (
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setEmailNotice(
                    "Apple sign-in is coming soon. Please use Google or GitHub.",
                  )
                }
                className="w-full h-11 text-sm font-medium flex items-center justify-center gap-3 rounded-lg border hover:bg-muted/60 transition-colors"
              >
                <AppleIcon aria-hidden="true" className="shrink-0" />
                <span>Continue with Apple</span>
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    setEmailNotice(
                      "SAML SSO is reserved for enterprise accounts. Please use Google or GitHub.",
                    )
                  }
                  className="w-full h-11 text-sm font-medium flex items-center justify-center gap-3 rounded-lg border hover:bg-muted/60 transition-colors"
                >
                  <KeyRound aria-hidden="true" className="shrink-0 h-4 w-4" />
                  <span>Continue with SAML SSO</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    setEmailNotice(
                      "Passkey authentication is in evaluation. Please use Google or GitHub.",
                    )
                  }
                  className="w-full h-11 text-sm font-medium flex items-center justify-center gap-3 rounded-lg border hover:bg-muted/60 transition-colors"
                >
                  <Fingerprint
                    aria-hidden="true"
                    className="shrink-0 h-4 w-4"
                  />
                  <span>Continue with Passkey</span>
                </Button>
              </>
            )}
          </div>
        )}

        <div className="pt-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setShowOtherOptions(!showOtherOptions)}
            className="w-full text-xs text-muted-foreground hover:text-foreground h-8"
          >
            <span>
              {showOtherOptions ? "Show fewer options" : "Show other options"}
            </span>
            {showOtherOptions ? (
              <ChevronUp className="h-3.5 w-3.5 ml-1" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 ml-1" />
            )}
          </Button>
        </div>

        {isSignUp && (
          <div className="text-center pt-2">
            <button
              type="button"
              onClick={() => setMode("login")}
              className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-1"
            >
              Continue with Email <ArrowRight className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>

      {/* Mode Switcher Footer */}
      <div className="mt-6 pt-5 border-t border-border text-center text-xs text-muted-foreground space-y-3">
        <p>
          {isSignUp ? (
            <>
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => {
                  setMode("login");
                  setEmailNotice("");
                }}
                className="font-medium text-foreground underline underline-offset-4 hover:text-primary"
              >
                Log in
              </button>
            </>
          ) : (
            <>
              Don&apos;t have an account?{" "}
              <button
                type="button"
                onClick={() => {
                  setMode("signup");
                  setEmailNotice("");
                }}
                className="font-medium text-foreground underline underline-offset-4 hover:text-primary"
              >
                Sign Up
              </button>
            </>
          )}
        </p>

        <p className="text-xs leading-relaxed text-muted-foreground">
          By {isSignUp ? "joining" : "signing in"}, you agree to our{" "}
          <span className="underline underline-offset-2">Terms of Service</span>{" "}
          and{" "}
          <span className="underline underline-offset-2">Privacy Policy</span>.
          Access is limited to approved identities.
        </p>
      </div>
    </Card>
  );
}
