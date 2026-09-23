"use client";

import { useEffect, useState, useCallback } from "react";
import { Cloud, Link, Plugs, ArrowsClockwise, HardDrives, Shield, CheckCircle, Warning, Spinner, Download, UploadSimple, ClockCounterClockwise, X } from "@phosphor-icons/react";
import { useLanguage, t } from "@/lib/lang-ctx/index";

type StorageStatus = {
  connected: boolean;
  status: string;
  googleEmail: string | null;
  googleName: string | null;
  rootFolderName: string;
  rootFolderId: string | null;
  lastSyncAt: string | null;
  lastSyncSuccessAt: string | null;
  pendingJobs: number;
  failedJobs: number;
  files: Array<{ entityType: string; lastSyncedAt: string | null; version: number; checksum: string | null }>;
};

export default function DataStorageCard() {
  const { lang } = useLanguage();
  const [status, setStatus] = useState<StorageStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/storage/status", { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setStatus(data);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchStatus(); }, [fetchStatus]);

  // Poll sync status every 10s when pending
  useEffect(() => {
    if (!status || status.pendingJobs === 0) return;
    const id = setInterval(() => void fetchStatus(), 10_000);
    return () => clearInterval(id);
  }, [status?.pendingJobs, fetchStatus]);

  const connect = () => {
    window.location.href = "/api/storage/google/connect";
  };

  const disconnect = async () => {
    setActionLoading("disconnect");
    setMsg(null);
    try {
      const res = await fetch("/api/storage/disconnect", { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      setMsg({ ok: true, text: t(lang, "সংযোগ বিচ্ছিন্ন করা হয়েছে", "Disconnected") });
      await fetchStatus();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setActionLoading(null);
    }
  };

  const sync = async (all = true) => {
    setActionLoading("sync");
    setMsg(null);
    try {
      const res = await fetch("/api/storage/sync", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ all }) });
      if (!res.ok) throw new Error(await res.text());
      setMsg({ ok: true, text: t(lang, "সিঙ্ক শুরু হয়েছে — ব্যাকগ্রাউন্ডে চলছে", "Sync started — running in background") });
      await fetchStatus();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="glass-card rounded-2xl border border-default p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <Spinner className="w-5 h-5 animate-spin text-[var(--dashboard-primary)]" />
          <span className="text-sm text-[var(--dashboard-text-muted)] font-mono">{t(lang, "লোড হচ্ছে…", "Loading…")}</span>
        </div>
      </div>
    );
  }

  const connected = status?.connected ?? false;
  const lastSuccess = status?.lastSyncSuccessAt ? new Date(status.lastSyncSuccessAt).toLocaleString(lang === "bn" ? "bn-BD" : "en-US") : "—";

  return (
    <div className="glass-card rounded-2xl border border-default p-5 sm:p-6">
      <header className="flex items-start gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl bg-[var(--dashboard-primary-subtle)] border border-[var(--accent)]/25 flex items-center justify-center shrink-0">
          <HardDrives className="w-5 h-5 text-[var(--dashboard-primary)]" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-2">
            {t(lang, "ডেটা ও স্টোরেজ", "Data & Storage")}
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${connected ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-700" : "bg-zinc-100 border-zinc-200 text-zinc-600"}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-emerald-500 animate-pulse" : "bg-zinc-400"}`} />
              {connected ? t(lang, "সংযুক্ত", "Connected") : t(lang, "সংযুক্ত নয়", "Not connected")}
            </span>
          </h3>
          <p className="text-xs text-[var(--dashboard-text-muted)] mt-0.5 leading-relaxed">
            {t(lang, "আপনার ব্যক্তিগত পড়ার ডেটা আপনার অনুমোদিত ক্লাউড স্টোরেজে সংরক্ষিত হয় এবং শুধুমাত্র আপনার অনুমতিতে অ্যাক্সেস করা হয়।", "Your personal study data is stored in your connected cloud storage and accessed only with your authorization.")}
          </p>
        </div>
      </header>

      {/* Status grid */}
      <div className="grid sm:grid-cols-3 gap-3 mb-4">
        <div className="p-3 rounded-xl bg-subtle border border-[var(--dashboard-border-muted)]">
          <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--dashboard-text-muted)] flex items-center gap-1"><Link className="w-3 h-3" />{t(lang, "অ্যাকাউন্ট", "Account")}</p>
          <p className="text-sm font-medium text-[var(--text-primary)] truncate mt-1">{status?.googleEmail ?? "—"}</p>
          <p className="text-xs text-[var(--dashboard-text-muted)] truncate">{status?.googleName ?? ""}</p>
        </div>
        <div className="p-3 rounded-xl bg-subtle border border-[var(--dashboard-border-muted)]">
          <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--dashboard-text-muted)] flex items-center gap-1"><Cloud className="w-3 h-3" />{t(lang, "লোকেশন", "Location")}</p>
          <p className="text-sm font-medium text-[var(--text-primary)] truncate mt-1">/{status?.rootFolderName ?? "9Th-Grade AI"}</p>
          <p className="text-xs text-[var(--dashboard-text-muted)] truncate">{status?.rootFolderId ? `ID ${status.rootFolderId.slice(0, 8)}…` : t(lang, "এখনো তৈরি হয়নি", "Not created yet")}</p>
        </div>
        <div className="p-3 rounded-xl bg-subtle border border-[var(--dashboard-border-muted)]">
          <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--dashboard-text-muted)] flex items-center gap-1"><ClockCounterClockwise className="w-3 h-3" />{t(lang, "শেষ সিঙ্ক", "Last sync")}</p>
          <p className="text-sm font-medium text-[var(--text-primary)] truncate mt-1">{lastSuccess}</p>
          <p className="text-xs text-[var(--dashboard-text-muted)]">
            {status?.pendingJobs ? `${status.pendingJobs} ${t(lang, "পেন্ডিং", "pending")}` : status?.failedJobs ? `${status.failedJobs} ${t(lang, "ব্যর্থ", "failed")}` : t(lang, "আপ-টু-ডেট", "Up to date")}
          </p>
        </div>
      </div>

      {/* Sync state */}
      {status && (status.pendingJobs > 0 || status.failedJobs > 0) && (
        <div className={`mb-4 p-3 rounded-xl border flex items-center gap-2 text-xs ${status.failedJobs > 0 ? "bg-amber-500/10 border-amber-500/20 text-amber-700" : "bg-sky-500/10 border-sky-500/20 text-sky-700"}`}>
          {status.pendingJobs > 0 ? <ArrowsClockwise className="w-4 h-4 animate-spin" /> : <Warning className="w-4 h-4" />}
          <span>
            {status.pendingJobs > 0
              ? t(lang, `${status.pendingJobs}টি পরিবর্তন সিঙ্ক হচ্ছে — অ্যাপ স্বাভাবিকভাবে ব্যবহার করুন`, `${status.pendingJobs} changes syncing — continue using the app`)
              : t(lang, `${status.failedJobs}টি সিঙ্ক ব্যর্থ — পুনরায় চেষ্টা হবে`, `${status.failedJobs} syncs failed — will retry`)}
          </span>
        </div>
      )}

      {/* Files (metadata only, no large data) */}
      {connected && status && status.files.length > 0 && (
        <div className="mb-4">
          <p className="text-[11px] font-mono uppercase tracking-wider text-[var(--dashboard-text-muted)] mb-2">{t(lang, "সংরক্ষিত ডেটাসেট", "Stored datasets")}</p>
          <div className="flex flex-wrap gap-1.5">
            {status.files.map((f) => (
              <span key={f.entityType} className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-mono bg-[var(--dashboard-surface-muted)] border border-[var(--dashboard-border-muted)] text-[var(--dashboard-text-secondary)]">
                <Shield className="w-3 h-3" /> {f.entityType} · v{f.version}
              </span>
            ))}
          </div>
        </div>
      )}

      {msg && (
        <p className={`text-xs font-mono mb-3 flex items-center gap-1.5 ${msg.ok ? "text-emerald-600" : "text-red-600"}`}>
          {msg.ok ? <CheckCircle className="w-3.5 h-3.5" /> : <Warning className="w-3.5 h-3.5" />} {msg.text}
        </p>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        {!connected ? (
          <button onClick={connect} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#4285F4] text-white text-sm font-semibold hover:bg-[#357ae8] transition-colors shadow-sm">
            <Plugs className="w-4 h-4" /> {t(lang, "Google Drive সংযুক্ত করুন", "Connect Google Drive")}
          </button>
        ) : (
          <>
            <button onClick={() => void sync(true)} disabled={!!actionLoading} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60 transition-colors">
              {actionLoading === "sync" ? <Spinner className="w-4 h-4 animate-spin" /> : <ArrowsClockwise className="w-4 h-4" />} {t(lang, "এখনই সিঙ্ক করুন", "Sync now")}
            </button>
            <button onClick={connect} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[var(--border-strong)] bg-white text-sm font-medium hover:bg-zinc-50 transition-colors">
              <Link className="w-4 h-4" /> {t(lang, "পুনরায় সংযুক্ত", "Reconnect")}
            </button>
            <button onClick={() => void disconnect()} disabled={!!actionLoading} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm font-medium hover:bg-red-100 disabled:opacity-60 transition-colors">
              {actionLoading === "disconnect" ? <Spinner className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />} {t(lang, "বিচ্ছিন্ন করুন", "Disconnect")}
            </button>
          </>
        )}
        <button onClick={() => void sync(true)} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[var(--border-strong)] bg-subtle text-sm font-mono hover:bg-white transition-colors">
          <Download className="w-4 h-4" /> {t(lang, "এক্সপোর্ট", "Export")}
        </button>
        <button onClick={() => void sync(true)} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[var(--border-strong)] bg-subtle text-sm font-mono hover:bg-white transition-colors">
          <UploadSimple className="w-4 h-4" /> {t(lang, "রিস্টোর", "Restore")}
        </button>
      </div>

      <p className="text-[11px] text-[var(--dashboard-text-muted)] mt-3 leading-relaxed flex items-start gap-1.5">
        <Shield className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        {t(lang, "ড্রাইভে শুধুমাত্র আপনার ব্যক্তিগত ডেটা (বুকমার্ক, ফ্ল্যাশকার্ড অবস্থা, ভুলের নোট) সংরক্ষিত হয়। PostgreSQL-এ অ্যাপের কার্যক্রমের জন্য প্রয়োজনীয় ন্যূনতম মেটাডেটা থাকে।", "Only your personal data (bookmarks, flashcard state, mistake notes) is stored in Drive. PostgreSQL keeps only minimal metadata for app operations.")}
      </p>
    </div>
  );
}
