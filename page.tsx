"use client";

import { useState, useRef } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type Mode = "file" | "link";

export default function Home() {
  const [mode, setMode] = useState<Mode>("file");
  const [url, setUrl] = useState("");
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // ── helpers ──────────────────────────────────────────────────────────────

  function reset() {
    setTranscript("");
    setError("");
    setTitle("");
  }

  // ── file upload ───────────────────────────────────────────────────────────

  async function transcribeFile(file: File) {
    reset();
    setLoading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${API}/api/transcribe`, { method: "POST", body: form });
      if (!res.ok) throw new Error((await res.json()).detail ?? res.statusText);
      const data = await res.json();
      setTranscript(data.text);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  // ── link transcription ────────────────────────────────────────────────────

  async function transcribeLink(linkUrl: string) {
    if (!linkUrl.trim()) return;
    reset();
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/transcribe-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: linkUrl.trim() }),
      });
      if (!res.ok) throw new Error((await res.json()).detail ?? res.statusText);
      const data = await res.json();
      setTranscript(data.text);
      if (data.title) setTitle(data.title);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  // ── drag & drop ───────────────────────────────────────────────────────────

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) transcribeFile(file);
  }

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center p-6 gap-8">
      <h1 className="text-3xl font-bold tracking-tight">🎙 Audio Transcriber</h1>

      {/* Mode toggle */}
      <div className="flex rounded-lg overflow-hidden border border-gray-700">
        {(["file", "link"] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => { setMode(m); reset(); }}
            className={`px-6 py-2 text-sm font-medium transition-colors ${
              mode === m
                ? "bg-indigo-600 text-white"
                : "bg-gray-900 text-gray-400 hover:bg-gray-800"
            }`}
          >
            {m === "file" ? "📁 Upload File" : "🔗 Paste Link"}
          </button>
        ))}
      </div>

      {/* File upload panel */}
      {mode === "file" && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
          className={`w-full max-w-lg border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
            dragging ? "border-indigo-400 bg-indigo-950" : "border-gray-700 hover:border-gray-500"
          }`}
        >
          <p className="text-gray-400">Drag & drop an audio/video file here</p>
          <p className="text-sm text-gray-600 mt-1">or click to browse</p>
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept="audio/*,video/*"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) transcribeFile(f); }}
          />
        </div>
      )}

      {/* Link input panel */}
      {mode === "link" && (
        <div className="w-full max-w-lg flex flex-col gap-3">
          <label className="text-sm text-gray-400">
            Paste a YouTube, Twitter/X, TikTok, or any supported video link
          </label>
          <div className="flex gap-2">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && transcribeLink(url)}
              placeholder="https://youtube.com/watch?v=..."
              className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500"
            />
            <button
              onClick={() => transcribeLink(url)}
              disabled={loading || !url.trim()}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded-lg text-sm font-medium transition-colors"
            >
              Transcribe
            </button>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-3 text-indigo-400">
          <span className="animate-spin text-xl">⏳</span>
          <span className="text-sm">
            {mode === "link" ? "Downloading & transcribing…" : "Transcribing…"}
          </span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="w-full max-w-lg bg-red-950 border border-red-700 rounded-lg px-4 py-3 text-sm text-red-300">
          ⚠️ {error}
        </div>
      )}

      {/* Result */}
      {transcript && (
        <div className="w-full max-w-lg flex flex-col gap-2">
          {title && <p className="text-xs text-gray-500 truncate">📺 {title}</p>}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 text-sm text-gray-200 leading-relaxed whitespace-pre-wrap max-h-96 overflow-y-auto">
            {transcript}
          </div>
          <button
            onClick={() => navigator.clipboard.writeText(transcript)}
            className="self-end text-xs text-indigo-400 hover:text-indigo-300"
          >
            Copy to clipboard
          </button>
        </div>
      )}
    </main>
  );
}
