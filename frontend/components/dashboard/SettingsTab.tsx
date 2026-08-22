"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  User,
  Mail,
  AtSign,
  Calendar,
  KeyRound,
  ShieldCheck,
  Bell,
  Sun,
  Moon,
  Download,
  Trash2,
  Database,
  Info,
  CheckCircle2,
  AlertTriangle,
  X,
  Pencil,
  Loader2,
  MonitorSmartphone,
  RefreshCw,
} from "lucide-react";
import { useAuth } from "@/lib/auth-ctx";
import { useTheme } from "@/lib/theme-ctx";
import { useDashboardStore } from "@/lib/store-ctx/dashboard";
import { useDialogA11y } from "@/lib/use-dialog-a11y";
import { account } from "@/lib/services/api";
import { handleApiError } from "@/lib/errors";
import LogoutButton from "./LogoutButton";

const STORE_KEY = "9th_grade_ai_store_v2";
const NOTIF_KEY = "9th_grade_ai_notif_pref";

const APP_VERSION = "0.4.0";

// Notification preference lives in localStorage — sourced via an external
// store (same pattern as theme-ctx) to stay hydration-safe and lint-clean.
function readNotifPref(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const stored = localStorage.getItem(NOTIF_KEY);
    return stored === null || stored === "on";
  } catch {
    return true;
  }
}
function getNotifSnapshot(): boolean {
  return readNotifPref();
}
function getNotifServerSnapshot(): boolean {
  return true;
}
function subscribeNotif(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
}

function formatDate(iso: string | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("bn-BD", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function SectionCard({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card rounded-2xl border border-default p-5 sm:p-6"
    >
      <header className="flex items-start gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center flex-shrink-0">
          {icon}
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white uppercase tracking-wider">{title}</h3>
          {description ? <p className="text-xs text-zinc-500 mt-0.5">{description}</p> : null}
        </div>
      </header>
      {children}
    </motion.section>
  );
}

function Field({
  label,
  id,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label htmlFor={id} className="block">
      <span className="block text-[11px] font-mono uppercase tracking-wider text-zinc-500 mb-1.5">
        {label}
      </span>
      <input
        id={id}
        {...props}
        className="w-full px-3.5 py-2.5 rounded-xl bg-subtle border border-zinc-800 text-sm text-white placeholder-zinc-600 outline-none transition-colors focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20"
      />
    </label>
  );
}

export default function SettingsTab() {
  const router = useRouter();
  const shouldReduceMotion = useReducedMotion();
  const { user, updateProfile, logout, tokenExpiry } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { lastSyncedAt, resetStore } = useDashboardStore();

  // ── Profile edit ──
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [nameMsg, setNameMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // ── Password ──
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [changingPw, setChangingPw] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // ── Notifications pref ──
  const notifPref = useSyncExternalStore(subscribeNotif, getNotifSnapshot, getNotifServerSnapshot);

  const toggleNotif = () => {
    const next = !notifPref;
    try {
      localStorage.setItem(NOTIF_KEY, next ? "on" : "off");
    } catch {
      /* ignore */
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("storage"));
    }
  };

  // ── Delete account modal ──
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleteDialogRef = useDialogA11y<HTMLDivElement>(confirmDelete, () => setConfirmDelete(false));
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const sessionInfo = useMemo(() => {
    if (!user) return null;
    return {
      expires: tokenExpiry ? new Date(tokenExpiry).toLocaleString("bn-BD") : "7 দিন",
    };
  }, [user, tokenExpiry]);

  const initial = user?.name?.charAt(0) ?? "U";

  const saveName = async () => {
    const trimmed = nameDraft.trim();
    if (trimmed.length < 2) {
      setNameMsg({ ok: false, text: "Name must be at least 2 characters." });
      return;
    }
    setSavingName(true);
    setNameMsg(null);
    try {
      await updateProfile(trimmed);
      setNameMsg({ ok: true, text: "Profile updated." });
      setEditingName(false);
    } catch (error) {
      setNameMsg({ ok: false, text: handleApiError(error).message });
    } finally {
      setSavingName(false);
    }
  };

  const changePassword = async () => {
    if (pw.next.length < 8) {
      setPwMsg({ ok: false, text: "New password must be at least 8 characters." });
      return;
    }
    if (pw.next !== pw.confirm) {
      setPwMsg({ ok: false, text: "Passwords do not match." });
      return;
    }
    setChangingPw(true);
    setPwMsg(null);
    try {
      await account.changePassword(pw.current, pw.next, pw.confirm);
      setPwMsg({ ok: true, text: "Password changed successfully." });
      setPw({ current: "", next: "", confirm: "" });
    } catch (error) {
      setPwMsg({ ok: false, text: handleApiError(error).message });
    } finally {
      setChangingPw(false);
    }
  };

  const exportData = () => {
    let local = {};
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) local = JSON.parse(raw);
    } catch {
      /* ignore */
    }

    const payload = {
      exportedAt: new Date().toISOString(),
      user: user ? { name: user.name, email: user.email, handle: user.handle, role: user.role } : null,
      local,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `9th-grade-ai-export-${user?.handle ?? "user"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDelete = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await account.deleteAccount();
      await logout();
      router.replace("/");
    } catch (error) {
      setDeleteError(handleApiError(error).message);
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Page heading */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3"
      >
        <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center">
          <MonitorSmartphone className="w-5.5 h-5.5 text-emerald-400" aria-hidden="true" />
        </div>
        <div>
          <h1 className="font-display text-xl font-semibold text-white">Settings</h1>
          <p className="text-xs text-zinc-500 font-mono">manage your account, security, and data</p>
        </div>
      </motion.div>

      {/* Profile */}
      <SectionCard
        icon={<User className="w-5 h-5 text-emerald-400" aria-hidden="true" />}
        title="Profile"
        description="Your public identity across the platform"
      >
        <div className="flex items-center gap-4 mb-5">
          <div className="relative">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-emerald-500/30 to-cyan-500/10 border border-emerald-500/35 flex items-center justify-center text-xl font-bold text-emerald-400">
              {initial}
            </div>
            <span className="absolute bottom-1 right-1 w-3 h-3 rounded-full bg-emerald-500 border-2 border-[var(--surface-solid)]" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            {editingName ? (
              <div className="flex items-center gap-2">
                <input
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void saveName();
                    if (e.key === "Escape") setEditingName(false);
                  }}
                  autoFocus
                  aria-label="Edit display name"
                  className="px-3 py-1.5 rounded-lg bg-subtle border border-emerald-500/40 text-sm text-white outline-none"
                />
                <button
                  onClick={() => void saveName()}
                  disabled={savingName}
                  className="px-3 py-1.5 rounded-lg bg-emerald-500 text-zinc-950 text-xs font-mono font-semibold hover:bg-emerald-400 transition-colors disabled:opacity-60"
                >
                  {savingName ? "Saving..." : "Save"}
                </button>
                <button
                  onClick={() => {
                    setEditingName(false);
                    setNameMsg(null);
                  }}
                  className="px-2.5 py-1.5 rounded-lg border border-zinc-700 text-xs font-mono text-zinc-400 hover:text-white transition-colors"
                  aria-label="Cancel editing"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <p className="text-lg font-semibold text-white truncate">{user?.name ?? "Student"}</p>
                <button
                  onClick={() => {
                    setNameDraft(user?.name ?? "");
                    setNameMsg(null);
                    setEditingName(true);
                  }}
                  className="p-1.5 rounded-lg text-zinc-500 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                  aria-label="Edit name"
                >
                  <Pencil className="w-4 h-4" />
                </button>
              </div>
            )}
            <p className="text-xs text-zinc-500 font-mono truncate">@{user?.handle ?? "student"}</p>
          </div>
        </div>
        {nameMsg ? (
          <p className={`text-xs font-mono mb-4 flex items-center gap-1.5 ${nameMsg.ok ? "text-emerald-400" : "text-red-400"}`}>
            <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
            {nameMsg.text}
          </p>
        ) : null}
        <dl className="grid sm:grid-cols-2 gap-3">
          <div className="flex items-center gap-2.5 p-3 rounded-xl bg-subtle border border-zinc-800">
            <Mail className="w-4 h-4 text-emerald-400 flex-shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <dt className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Email</dt>
              <dd className="text-sm text-zinc-200 truncate">{user?.email ?? "—"}</dd>
            </div>
          </div>
          <div className="flex items-center gap-2.5 p-3 rounded-xl bg-subtle border border-zinc-800">
            <AtSign className="w-4 h-4 text-emerald-400 flex-shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <dt className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Handle</dt>
              <dd className="text-sm text-zinc-200 truncate">@{user?.handle ?? "student"}</dd>
            </div>
          </div>
          <div className="flex items-center gap-2.5 p-3 rounded-xl bg-subtle border border-zinc-800 sm:col-span-2">
            <Calendar className="w-4 h-4 text-emerald-400 flex-shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <dt className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Member since</dt>
              <dd className="text-sm text-zinc-200">{formatDate(user?.createdAt)}</dd>
            </div>
          </div>
        </dl>
      </SectionCard>

      {/* Security */}
      <SectionCard
        icon={<KeyRound className="w-5 h-5 text-emerald-400" aria-hidden="true" />}
        title="Security"
        description="Keep your account safe"
      >
        <div className="grid sm:grid-cols-3 gap-3">
          <Field
            label="Current password"
            id="current-password"
            type="password"
            autoComplete="current-password"
            value={pw.current}
            onChange={(e) => setPw((p) => ({ ...p, current: e.target.value }))}
          />
          <Field
            label="New password"
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={pw.next}
            onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))}
          />
          <Field
            label="Confirm new"
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            value={pw.confirm}
            onChange={(e) => setPw((p) => ({ ...p, confirm: e.target.value }))}
          />
        </div>
        {pwMsg ? (
          <p className={`text-xs font-mono mt-3 flex items-center gap-1.5 ${pwMsg.ok ? "text-emerald-400" : "text-red-400"}`}>
            <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
            {pwMsg.text}
          </p>
        ) : null}
        <button
          onClick={() => void changePassword()}
          disabled={changingPw}
          className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 text-zinc-950 text-sm font-mono font-semibold hover:bg-emerald-400 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {changingPw ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <KeyRound className="w-4 h-4" aria-hidden="true" />}
          {changingPw ? "Updating..." : "Change password"}
        </button>
        <p className="mt-3 text-[11px] text-zinc-500 font-mono flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
          Passwords are hashed with bcrypt (cost 10) — never stored in plain text.
        </p>
      </SectionCard>

      {/* Preferences */}
      <SectionCard
        icon={<Bell className="w-5 h-5 text-emerald-400" aria-hidden="true" />}
        title="Preferences"
        description="Tune how the app looks and notifies you"
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4 p-3.5 rounded-xl bg-subtle border border-zinc-800">
            <div className="flex items-center gap-3">
              {theme === "dark" ? <Moon className="w-5 h-5 text-emerald-400" aria-hidden="true" /> : <Sun className="w-5 h-5 text-amber-400" aria-hidden="true" />}
              <div>
                <p className="text-sm text-zinc-200 font-medium">Appearance</p>
                <p className="text-[11px] text-zinc-500 font-mono">{theme === "dark" ? "Dark mode active" : "Light mode active"}</p>
              </div>
            </div>
            <button
              onClick={toggleTheme}
              className="relative w-14 h-7 rounded-full bg-zinc-800 border border-zinc-700 transition-colors"
              role="switch"
              aria-checked={theme === "light"}
              aria-label="Toggle theme"
            >
              <motion.span
                layout
                transition={{ type: "spring", stiffness: 500, damping: 32 }}
                className={`absolute top-0.5 w-6 h-6 rounded-full bg-emerald-500 shadow-neon-glow ${theme === "light" ? "left-[30px]" : "left-0.5"}`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between gap-4 p-3.5 rounded-xl bg-subtle border border-zinc-800">
            <div className="flex items-center gap-3">
              <Bell className="w-5 h-5 text-emerald-400" aria-hidden="true" />
              <div>
                <p className="text-sm text-zinc-200 font-medium">Notifications</p>
                <p className="text-[11px] text-zinc-500 font-mono">Announcements & reminders</p>
              </div>
            </div>
            <button
              onClick={toggleNotif}
              className="relative w-14 h-7 rounded-full bg-zinc-800 border border-zinc-700 transition-colors"
              role="switch"
              aria-checked={notifPref}
              aria-label="Toggle notifications"
            >
              <motion.span
                layout
                transition={{ type: "spring", stiffness: 500, damping: 32 }}
                className={`absolute top-0.5 w-6 h-6 rounded-full bg-emerald-500 shadow-neon-glow ${notifPref ? "left-[30px]" : "left-0.5"}`}
              />
            </button>
          </div>
        </div>
      </SectionCard>

      {/* Session & data */}
      <SectionCard
        icon={<Database className="w-5 h-5 text-emerald-400" aria-hidden="true" />}
        title="Session & data"
        description="Your privacy is in your hands"
      >
        <dl className="grid sm:grid-cols-2 gap-3 mb-5">
          <div className="flex items-center gap-2.5 p-3 rounded-xl bg-subtle border border-zinc-800">
            <MonitorSmartphone className="w-4 h-4 text-emerald-400 flex-shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <dt className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Signed in as</dt>
              <dd className="text-sm text-zinc-200 truncate">{user?.email ?? "—"}</dd>
            </div>
          </div>
          <div className="flex items-center gap-2.5 p-3 rounded-xl bg-subtle border border-zinc-800">
            <RefreshCw className="w-4 h-4 text-emerald-400 flex-shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <dt className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Session expiry</dt>
              <dd className="text-sm text-zinc-200 truncate">{sessionInfo?.expires ?? "—"}</dd>
            </div>
          </div>
        </dl>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={exportData}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-sm font-mono hover:bg-emerald-500/20 transition-colors"
          >
            <Download className="w-4 h-4" aria-hidden="true" />
            Export my data
          </button>
          <button
            onClick={() => {
              resetStore();
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-700 bg-subtle text-zinc-300 text-sm font-mono hover:border-zinc-500 hover:text-white transition-colors"
          >
            <Database className="w-4 h-4" aria-hidden="true" />
            Clear local data
          </button>
        </div>
        <p className="mt-3 text-[11px] text-zinc-500 font-mono">
          Last synced with server: {lastSyncedAt ? new Date(lastSyncedAt).toLocaleString("bn-BD") : "never"}
        </p>
      </SectionCard>

      {/* Danger zone */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-red-500/25 bg-red-500/[0.04] p-5 sm:p-6"
      >
        <header className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/25 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5 text-red-400" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-red-400 uppercase tracking-wider">Danger zone</h3>
            <p className="text-xs text-zinc-500 mt-0.5">Irreversible actions for your account</p>
          </div>
        </header>
        <div className="flex flex-wrap items-center gap-3">
          <LogoutButton variant="solid" aria-label="Log out of your account" />
          <button
            onClick={() => setConfirmDelete(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-mono hover:bg-red-500/20 transition-colors"
          >
            <Trash2 className="w-4 h-4" aria-hidden="true" />
            Delete account
          </button>
        </div>
      </motion.section>

      {/* About */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card rounded-2xl border border-default p-5 sm:p-6"
      >
        <header className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center flex-shrink-0">
            <Info className="w-5 h-5 text-emerald-400" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider">About</h3>
            <p className="text-xs text-zinc-500 mt-0.5">9th-grade-ai — free exam prep for Bangladesh</p>
          </div>
        </header>
        <dl className="flex flex-wrap gap-x-8 gap-y-2 text-xs font-mono">
          <div>
            <dt className="text-zinc-500 uppercase tracking-wider text-[10px]">Version</dt>
            <dd className="text-zinc-200 mt-0.5">v{APP_VERSION}</dd>
          </div>
          <div>
            <dt className="text-zinc-500 uppercase tracking-wider text-[10px]">Plan</dt>
            <dd className="text-zinc-200 mt-0.5">Free forever</dd>
          </div>
          <div>
            <dt className="text-zinc-500 uppercase tracking-wider text-[10px]">Open source</dt>
            <dd className="text-zinc-200 mt-0.5">MIT License</dd>
          </div>
        </dl>
      </motion.section>

      {/* Delete confirmation modal */}
      <AnimatePresence>
        {confirmDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Confirm account deletion"
          >
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setConfirmDelete(false)} />
            <motion.div
              ref={deleteDialogRef}
              tabIndex={-1}
              initial={{ scale: shouldReduceMotion ? 1 : 0.95, y: shouldReduceMotion ? 0 : 8 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              className="relative w-full max-w-md rounded-2xl border border-red-500/25 bg-[var(--surface-raised)] p-6 shadow-panel"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/25 flex items-center justify-center">
                    <Trash2 className="w-5 h-5 text-red-400" aria-hidden="true" />
                  </div>
                  <h2 className="text-lg font-semibold text-white">Delete account?</h2>
                </div>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="p-1.5 rounded-lg text-zinc-500 hover:text-white transition-colors"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-sm text-zinc-400 leading-relaxed">
                This permanently removes your profile, progress, bookmarks, and study history from our servers.
                This action cannot be undone.
              </p>
              {deleteError ? (
                <p className="mt-3 text-xs font-mono text-red-400">{deleteError}</p>
              ) : null}
              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => setConfirmDelete(false)}
                  disabled={deleting}
                  className="px-4 py-2 rounded-xl border border-zinc-700 text-sm font-mono text-zinc-300 hover:text-white transition-colors disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void handleDelete()}
                  disabled={deleting}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500 text-zinc-950 text-sm font-mono font-semibold hover:bg-red-400 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {deleting ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Trash2 className="w-4 h-4" aria-hidden="true" />}
                  {deleting ? "Deleting..." : "Delete forever"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}