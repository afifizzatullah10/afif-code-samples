"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";

type SubmitState = "idle" | "submitting" | "success" | "error";

export function FeedbackForm() {
  const [message, setMessage] = useState("");
  const [state, setState] = useState<SubmitState>("idle");
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState("submitting");
    setError("");

    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          pageUrl: window.location.pathname,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };

      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Could not send feedback.");
      }

      setMessage("");
      setState("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setState("error");
    }
  }

  const isSubmitting = state === "submitting";

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-2xl border border-white/12 bg-white/[0.05] p-5 backdrop-blur-md"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-heading text-xl font-semibold">Send feedback</h2>
          <p className="mt-1 text-sm text-amber-100/65">
            Tell us what worked, what felt confusing, or what you want next.
          </p>
        </div>
      </div>

      <label className="mt-4 block">
        <span className="sr-only">Feedback message</span>
        <textarea
          value={message}
          onChange={(e) => {
            setMessage(e.target.value);
            if (state === "success") setState("idle");
          }}
          required
          minLength={5}
          maxLength={2000}
          rows={4}
          placeholder="Write your feedback here..."
          className="w-full resize-y rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-amber-50 outline-none placeholder:text-amber-100/35 focus-visible:border-amber-200/50 focus-visible:ring-2 focus-visible:ring-amber-200/30"
          disabled={isSubmitting}
        />
      </label>

      {state === "success" && (
        <p className="mt-3 rounded-lg border border-emerald-400/35 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
          Thank you. Your feedback was sent.
        </p>
      )}
      {state === "error" && (
        <p className="mt-3 rounded-lg border border-red-400/35 bg-red-500/10 px-3 py-2 text-sm text-red-100">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isSubmitting || message.trim().length < 5}
        className="mt-4 inline-flex min-h-10 items-center justify-center rounded-lg bg-amber-200 px-4 text-sm font-medium text-[#1a1340] transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 size-4 animate-spin" />
            Sending...
          </>
        ) : (
          "Send feedback"
        )}
      </button>
    </form>
  );
}
