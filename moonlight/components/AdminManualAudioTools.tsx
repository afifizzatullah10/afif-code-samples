"use client";

import { Copy, Loader2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export function AdminManualAudioTools({
  orderId,
  storyText,
}: {
  orderId: string;
  storyText: string | null;
}) {
  const router = useRouter();
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMessage, setOkMessage] = useState<string | null>(null);

  async function onCopy() {
    if (!storyText) return;
    try {
      await navigator.clipboard.writeText(storyText);
      setCopyState("copied");
      setTimeout(() => setCopyState("idle"), 2000);
    } catch {
      setCopyState("error");
    }
  }

  async function onUpload() {
    if (!selectedFile) return;
    setBusy(true);
    setError(null);
    setOkMessage(null);
    try {
      const formData = new FormData();
      formData.set("audio", selectedFile);
      const res = await fetch(`/api/admin/orders/${orderId}/upload-audio`, {
        method: "POST",
        body: formData,
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || `Upload failed (${res.status})`);
      }

      setOkMessage("Audio uploaded and order marked ready.");
      setSelectedFile(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown upload error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-6 rounded-xl border border-white/12 bg-white/[0.03] p-4">
      <h2 className="text-sm font-semibold text-amber-100">
        Manual recovery tools
      </h2>
      <p className="mt-1 text-xs text-amber-100/70">
        Copy story text for manual ElevenLabs narration, then upload audio here.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={onCopy}
          disabled={!storyText}
          className="border-white/20 bg-white/5 text-amber-50 hover:bg-white/10"
        >
          <Copy className="mr-2 size-4" />
          {!storyText
            ? "No text yet"
            : copyState === "copied"
              ? "Copied"
              : copyState === "error"
                ? "Copy failed"
                : "Copy story text"}
        </Button>

        <input
          type="file"
          accept="audio/mpeg,audio/mp3,audio/mp4,audio/x-m4a,audio/wav,audio/x-wav,audio/ogg,.mp3,.m4a,.wav,.ogg"
          onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
          className="block text-xs text-amber-100/80 file:mr-3 file:rounded-md file:border file:border-white/20 file:bg-white/5 file:px-2 file:py-1 file:text-xs file:text-amber-50 hover:file:bg-white/10"
        />

        <Button
          type="button"
          onClick={onUpload}
          disabled={busy || !selectedFile}
          className="bg-emerald-500 text-white hover:bg-emerald-400"
        >
          {busy ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Uploading…
            </>
          ) : (
            <>
              <Upload className="mr-2 size-4" />
              Upload manual audio
            </>
          )}
        </Button>
      </div>

      {selectedFile && (
        <p className="mt-2 text-xs text-amber-100/70">
          Selected: {selectedFile.name}
        </p>
      )}
      {!storyText && (
        <p className="mt-2 text-xs text-amber-100/70">
          Story text not available yet. If upload fails, run Retry first so text is generated.
        </p>
      )}
      {okMessage && (
        <p className="mt-3 rounded-lg border border-emerald-400/35 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
          {okMessage}
        </p>
      )}
      {error && (
        <p className="mt-3 rounded-lg border border-red-400/40 bg-red-950/40 px-3 py-2 text-sm text-red-100">
          {error}
        </p>
      )}
    </section>
  );
}

