"use client";

// Daily Current Affairs tab — the autonomous agent's
// daily note for BCS / Bank / 9th-grade aspirants:
// verified note, source citations, interactive MCQs,
// personal re-edits, and PDF/DOCX/Markdown export.

import { useCallback, useEffect, useState } from "react";
import {
  Newspaper,
  CalendarBlank,
  ShieldCheck,
  FilePdf,
  FileDoc,
  Copy,
} from "@phosphor-icons/react";
import { api } from "@/lib/services/api";
import { useToastSafe } from "@/lib/toast-ctx";
import { useLanguage, t } from "@/lib/lang-ctx";
import { Skeleton, SkeletonCard } from "@/components/ui/Skeleton";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import NoteEditor from "@/components/current-affairs/NoteEditor";
import CitationDrawer from "@/components/current-affairs/CitationDrawer";
import McqQuizWidget from "@/components/current-affairs/McqQuizWidget";
import {
  docToMarkdown,
  copyMarkdownToClipboard,
  exportNoteDocx,
} from "@/components/current-affairs/exportNote";
import type { Server } from "@/lib/types";

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading current affairs">
      <SkeletonCard className="p-6">
        <Skeleton className="h-6 w-2/3" />
        <div className="mt-3 space-y-2.5">
          <Skeleton className="h-4 w-[92%]" />
          <Skeleton className="h-4 w-[78%]" />
          <Skeleton className="h-4 w-[60%]" />
        </div>
      </SkeletonCard>
      <SkeletonCard className="h-40" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}

function EmptyState({ onToday, onGenerate, generating }: { onToday: () => void; onGenerate: () => void; generating: boolean }) {
  const { lang } = useLanguage();
  return (
    <div
      className="flex flex-col items-center justify-center rounded-2xl border px-6 py-16 text-center"
      style={{ borderColor: "var(--dashboard-border-muted)", background: "var(--dashboard-surface-solid)" }}
    >
      <Newspaper className="h-10 w-10" style={{ color: "var(--dashboard-text-muted)" }} aria-hidden="true" />
      <h3 className="mt-3 text-base font-bold" style={{ color: "var(--dashboard-text-primary)" }}>
        {t(lang, "এই তারিখের কোনো সমাচার নেই", "No note for this date yet")}
      </h3>
      <p className="mt-1 max-w-sm text-sm" style={{ color: "var(--dashboard-text-muted)" }}>
        {t(
          lang,
          "দৈনিক সমাচার এজেন্ট প্রতিদিন নতুন নোট তৈরি করে। আজকের নোট এখনই তৈরি করুন অথবা পরবর্তীতে চেক করুন।",
          "The daily agent researches the web and writes a fresh note each day. Generate today's note now or check back later.",
        )}
      </p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={onGenerate}
          disabled={generating}
          className="inline-flex min-h-[44px] items-center rounded-xl px-5 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50"
          style={{ background: "var(--dashboard-primary)" }}
        >
          {generating
            ? t(lang, "তৈরি হচ্ছে…", "Researching…")
            : t(lang, "আজকের সমাচার তৈরি করুন", "Generate today's note")}
        </button>
        <button
          type="button"
          onClick={onToday}
          className="inline-flex min-h-[44px] items-center rounded-xl border px-5 text-sm font-semibold transition-colors hover:bg-white/5"
          style={{ borderColor: "var(--dashboard-border-muted)", color: "var(--dashboard-text-primary)" }}
        >
          {t(lang, "আজকের সমাচার", "Today's note")}
        </button>
      </div>
    </div>
  );
}

export default function CurrentAffairsTab() {
  const toast = useToastSafe();
  const { lang } = useLanguage();

  const [date, setDate] = useState(todayString());
  const [payload, setPayload] = useState<Server.CurrentAffairsLatestDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingDocx, setExportingDocx] = useState(false);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async (day: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.currentAffairsLatest(day);
      setPayload(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load current affairs");
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(date);
  }, [date, load]);

  const note = payload?.note ?? null;
  // The user's saved personal version wins over the AI original.
  const editorDoc = payload?.userNote?.customContentJson ?? note?.contentJson ?? null;

  const saveMyNote = async (doc: unknown) => {
    if (!note) return;
    setSaving(true);
    try {
      await api.saveCurrentAffairsNote(note.id, doc);
      toast.success(
        t(lang, "আপনার নোট সংরক্ষিত হয়েছে", "Your note saved"),
      );
      // Refresh so the saved timestamp is reflected.
      await load(date);
    } catch (err) {
      toast.error(
        t(lang, "নোট সংরক্ষণে সমস্যা হয়েছে", "Could not save your note"),
      );
      throw err;
    } finally {
      setSaving(false);
    }
  };

  const downloadPdf = async () => {
    setExportingPdf(true);
    try {
      const blob = await api.exportCurrentAffairsPdf(date);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `current-affairs-${date}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast.error(t(lang, "PDF এক্সপোর্টে সমস্যা হয়েছে", "PDF export failed"));
    } finally {
      setExportingPdf(false);
    }
  };

  const downloadDocx = async () => {
    if (!note) return;
    setExportingDocx(true);
    try {
      await exportNoteDocx(note.title, note.date, editorDoc, note.citations, note.mcqs);
      toast.success(t(lang, "DOCX ডাউনলোড হচ্ছে", "DOCX downloading"));
    } catch {
      toast.error(t(lang, "DOCX এক্সপোর্টে সমস্যা হয়েছে", "DOCX export failed"));
    } finally {
      setExportingDocx(false);
    }
  };

  const copyMarkdown = async () => {
    if (!note) return;
    const md = docToMarkdown(note.title, note.date, editorDoc, note.citations, note.mcqs);
    const ok = await copyMarkdownToClipboard(md);
    toast.success(
      ok
        ? t(lang, "মার্কডাউন কপি হয়েছে", "Markdown copied")
        : t(lang, "কপি করতে পারেনি", "Copy failed"),
    );
  };

  // Self-heal: when the cron missed a day, research + generate the note
  // on demand instead of leaving the tab empty until tomorrow.
  const generateToday = async () => {
    setGenerating(true);
    try {
      const data = await api.generateCurrentAffairsNote(date);
      setPayload({ note: data.note, userNote: null });
      toast.success(
        data.generated
          ? t(lang, "আজকের সমাচার তৈরি হয়েছে", "Today's note is ready")
          : t(lang, "নোট আগে থেকেই ছিল", "Note already existed"),
      );
    } catch {
      toast.error(t(lang, "নোট তৈরি করা যায়নি", "Could not generate the note"));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <ErrorBoundary>
      <div className="space-y-4">
        {/* Header + date toolbar */}
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 font-display text-xl font-bold" style={{ color: "var(--dashboard-text-primary)" }}>
              <Newspaper className="h-5 w-5" style={{ color: "var(--dashboard-primary)" }} aria-hidden="true" />
              {t(lang, "দৈনিক সাম্প্রতিক সমাচার", "Daily Current Affairs")}
            </h1>
            <p className="mt-0.5 text-xs" style={{ color: "var(--dashboard-text-muted)" }}>
              {t(lang, "BCS · ব্যাংক · ৯ম গ্রেড — যাচাইকৃত উৎসের দৈনিক নোট", "BCS · Bank · 9th Grade — daily notes from verified sources")}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span
              className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide"
              style={{ borderColor: "var(--dashboard-success)", background: "var(--dashboard-success-subtle)", color: "var(--dashboard-success)" }}
            >
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              100% Authenticated Sources
            </span>
            <label
              className="inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5"
              style={{ borderColor: "var(--dashboard-border-muted)", background: "var(--dashboard-surface-muted)" }}
            >
              <CalendarBlank className="h-4 w-4" style={{ color: "var(--dashboard-text-muted)" }} aria-hidden="true" />
              <input
                type="date"
                value={date}
                max={todayString()}
                onChange={(e) => {
                  const v = e.target.value;
                  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) setDate(v);
                }}
                aria-label={t(lang, "তারিখ নির্বাচন করুন", "Select date")}
                className="bg-transparent font-mono text-xs font-semibold focus:outline-none"
                style={{ color: "var(--dashboard-text-primary)" }}
              />
            </label>
          </div>
        </header>

        {loading ? (
          <LoadingSkeleton />
        ) : error ? (
          <div className="glass-card rounded-2xl border border-red-500/20 p-8 text-center" role="alert">
            <p className="font-mono text-sm text-[var(--dashboard-danger)]">{error}</p>
            <button
              type="button"
              onClick={() => void load(date)}
              className="mt-3 min-h-[44px] rounded-lg border border-[var(--dashboard-border-muted)] px-4 font-mono text-sm"
              style={{ color: "var(--dashboard-text-primary)" }}
            >
              {t(lang, "আবার চেষ্টা করুন", "Try again")}
            </button>
          </div>
        ) : !note ? (
          <EmptyState onToday={() => setDate(todayString())} onGenerate={() => void generateToday()} generating={generating} />
        ) : (
          <>
            {/* Note + export toolbar */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-1.5" role="toolbar" aria-label="Export options">
                <span className="mr-1 text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--dashboard-text-muted)" }}>
                  {t(lang, "এক্সপোর্ট", "Export")}:
                </span>
                <button
                  type="button"
                  onClick={() => void downloadPdf()}
                  disabled={exportingPdf}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition-colors hover:bg-white/5 disabled:opacity-50"
                  style={{ borderColor: "var(--dashboard-border-muted)", color: "var(--dashboard-text-secondary)" }}
                >
                  <FilePdf className="h-4 w-4" style={{ color: "var(--dashboard-danger)" }} aria-hidden="true" />
                  {exportingPdf ? "…" : "PDF"}
                </button>
                <button
                  type="button"
                  onClick={() => void downloadDocx()}
                  disabled={exportingDocx}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition-colors hover:bg-white/5 disabled:opacity-50"
                  style={{ borderColor: "var(--dashboard-border-muted)", color: "var(--dashboard-text-secondary)" }}
                >
                  <FileDoc className="h-4 w-4" style={{ color: "var(--dashboard-primary)" }} aria-hidden="true" />
                  {exportingDocx ? "…" : "DOCX"}
                </button>
                <button
                  type="button"
                  onClick={() => void copyMarkdown()}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition-colors hover:bg-white/5"
                  style={{ borderColor: "var(--dashboard-border-muted)", color: "var(--dashboard-text-secondary)" }}
                >
                  <Copy className="h-4 w-4" aria-hidden="true" />
                  {t(lang, "মার্কডাউন কপি", "Copy Markdown")}
                </button>
              </div>

              <NoteEditor
                initialDoc={editorDoc}
                onSave={saveMyNote}
                saving={saving}
                saveLabel={t(lang, "আমার নোট সংরক্ষণ করুন", "Save My Notes")}
              />
            </div>

            {/* Citations + MCQs */}
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
              <CitationDrawer
                citations={note.citations}
                title={t(lang, "উৎস তালিকা", "Verified Sources")}
                badge={t(lang, "১০০% যাচাইকৃত উৎস", "100% Authenticated Sources")}
              />
              <McqQuizWidget
                mcqs={note.mcqs}
                title={t(lang, "অনুশীলন MCQ", "Practice MCQs")}
                subtitle={t(lang, "আজকের নোট থেকে", "From today's note")}
                dailyNoteId={note.id}
              />
            </div>
          </>
        )}
      </div>
    </ErrorBoundary>
  );
}
