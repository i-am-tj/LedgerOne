"use client";
import { useState } from "react";
import { LogOut, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function GoogleSignIn({ available }: { available: boolean }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function signIn() {
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/auth/sign-in/social", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "google",
          callbackURL: "/",
          errorCallbackURL: "/login?error=signin",
        }),
      });
      const data = await response.json();
      if (
        !response.ok ||
        typeof data.url !== "string" ||
        new URL(data.url).origin !== "https://accounts.google.com"
      )
        throw new Error("Sign in unavailable");
      window.location.assign(data.url);
    } catch {
      setPending(false);
      setError("Sign-in couldn’t start. Please try again.");
    }
  }
  return (
    <>
      <Button
        onClick={signIn}
        disabled={!available || pending}
        className="w-full"
        aria-busy={pending}
      >
        {pending ? (
          <LoaderCircle aria-hidden="true" className="loading-spinner" />
        ) : null}
        {pending ? "Connecting to Google…" : "Continue with Google"}
      </Button>
      {error && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      )}
    </>
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
