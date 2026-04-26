"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  nextPath?: string;
  initialError?: string;
};

type Mode = "signin" | "signup";

export function LoginForm({ nextPath, initialError }: Props) {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyGoogle, setBusyGoogle] = useState(false);
  const [busyReset, setBusyReset] = useState(false);
  const [error, setError] = useState(initialError || "");
  const [info, setInfo] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setInfo("");

    try {
      const res = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, email, password }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        needsConfirmation?: boolean;
        error?: string;
      };

      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Something went wrong.");
      }

      if (data.needsConfirmation) {
        setInfo(
          `Check ${email} for a confirmation link. Click it, then come back here and sign in.`
        );
        setBusy(false);
        return;
      }

      // Full page reload so the proxy re-reads cookies and server components
      // pick up the authenticated state.
      window.location.assign(nextPath || "/library");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setBusy(false);
    }
  }

  function onGoogleSignIn() {
    setBusyGoogle(true);
    setError("");
    setInfo("");
    const next = encodeURIComponent(nextPath || "/library");
    window.location.assign(`/api/auth/google?next=${next}`);
  }

  async function onForgotPassword() {
    setBusyReset(true);
    setError("");
    setInfo("");

    try {
      if (!email) {
        throw new Error("Enter your email first, then click Forgot password.");
      }

      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Could not send reset email.");
      }

      setInfo(`Password reset link sent to ${email}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setBusyReset(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="w-full space-y-5 rounded-2xl border border-white/12 bg-white/[0.05] p-6 text-left shadow-xl shadow-black/30 backdrop-blur-md"
    >
      <div className="flex gap-2 rounded-lg border border-white/10 bg-white/5 p-1 text-xs">
        <button
          type="button"
          onClick={() => {
            setMode("signin");
            setError("");
            setInfo("");
          }}
          className={tabClass(mode === "signin")}
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("signup");
            setError("");
            setInfo("");
          }}
          className={tabClass(mode === "signup")}
        >
          Create account
        </button>
      </div>

      <button
        type="button"
        onClick={onGoogleSignIn}
        disabled={busy || busyGoogle}
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-white/15 bg-white px-4 text-sm font-medium text-[#1a1340] transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busyGoogle ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Opening Google...
          </>
        ) : (
          <>
            <span className="text-lg font-semibold" aria-hidden>
              G
            </span>
            Continue with Google
          </>
        )}
      </button>

      <div className="flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-amber-100/40">
        <span className="h-px flex-1 bg-white/10" />
        or
        <span className="h-px flex-1 bg-white/10" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-11 bg-white/5"
          disabled={busy}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <Label htmlFor="password">Password</Label>
          {mode === "signup" ? (
            <span className="text-[11px] text-amber-100/50">
              At least 8 characters
            </span>
          ) : (
            <button
              type="button"
              onClick={onForgotPassword}
              className="text-[11px] text-amber-100/70 underline-offset-2 hover:text-amber-100 hover:underline disabled:opacity-60"
              disabled={busy || busyReset}
            >
              {busyReset ? "Sending..." : "Forgot password?"}
            </button>
          )}
        </div>
        <Input
          id="password"
          type="password"
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="h-11 bg-white/5"
          disabled={busy}
        />
      </div>

      {error && (
        <p className="rounded-lg border border-red-400/40 bg-red-950/40 px-3 py-2 text-sm text-red-100">
          {error}
        </p>
      )}
      {info && (
        <p className="rounded-lg border border-emerald-400/40 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-100">
          {info}
        </p>
      )}

      <Button type="submit" size="lg" disabled={busy} className="w-full min-h-11">
        {busy ? (
          <>
            <Loader2 className="mr-2 size-4 animate-spin" />
            {mode === "signin" ? "Signing in…" : "Creating account…"}
          </>
        ) : mode === "signin" ? (
          "Sign in"
        ) : (
          "Create account"
        )}
      </Button>

      <p className="text-center text-xs text-amber-100/50">
        {mode === "signin" ? (
          <>
            New here?{" "}
            <button
              type="button"
              onClick={() => setMode("signup")}
              className="underline hover:text-amber-100"
            >
              Create an account
            </button>
            .
          </>
        ) : (
          <>
            Already have an account?{" "}
            <button
              type="button"
              onClick={() => setMode("signin")}
              className="underline hover:text-amber-100"
            >
              Sign in
            </button>
            .
          </>
        )}
      </p>
    </form>
  );
}

function tabClass(active: boolean) {
  return active
    ? "flex-1 rounded-md bg-amber-200 px-3 py-1.5 font-medium text-[#1a1340]"
    : "flex-1 rounded-md px-3 py-1.5 text-amber-100/70 hover:text-amber-50";
}
