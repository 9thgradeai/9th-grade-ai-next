"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, X, Trophy, CheckCircle2, AlertTriangle, Info, Megaphone, Medal } from "lucide-react";
import { api } from "@/lib/services/api";
import type { Server } from "@/lib/types";
import { AnimatedList } from "@/components/ui/AnimatedList";

type Tab = "notifications" | "badges";

const TYPE_ICONS: Record<string, typeof CheckCircle2> = {
  SUCCESS: CheckCircle2,
  WARNING: AlertTriangle,
  INFO: Info,
  REMINDER: Bell,
};

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "এইমাত্র";
  if (mins < 60) return `${mins} মিনিট আগে`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ঘণ্টা আগে`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} দিন আগে`;
  return new Date(iso).toLocaleDateString("bn-BD");
}

export default function NotificationCenter() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("notifications");
  const [notifications, setNotifications] = useState<Server.NotificationDTO[]>([]);
  const [badges, setBadges] = useState<Server.BadgeDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const panelRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [n, b] = await Promise.allSettled([api.notifications(), api.badges()]);
        if (cancelled) return;
        if (n.status === "fulfilled") setNotifications(n.value);
        if (b.status === "fulfilled") setBadges(b.value);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Escape to close + focus trap + restore focus while the panel is open.
  useEffect(() => {
    if (!isOpen) return;
    const panel = panelRef.current;
    if (!panel) return;

    const prevFocused = document.activeElement as HTMLElement | null;
    const focusable = panel.querySelector<HTMLElement>("button");
    focusable?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
        return;
      }
      if (e.key !== "Tab") return;
      const nodes = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute("disabled"));
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      prevFocused?.focus?.();
    };
  }, [isOpen]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAsRead = async (id: number) => {
    try {
      await api.markNotificationRead(id);
    } catch {
      // keep local state even if server read fails
    }
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );
  };

  return (
    <>
      {/* Notification Bell Button */}
      <button
        ref={bellRef}
        onClick={() => setIsOpen(true)}
        className="relative w-11 h-11 flex items-center justify-center text-[var(--dashboard-text-muted)] hover:text-[var(--dashboard-primary)] transition-colors rounded-lg hover:bg-[var(--dashboard-primary-subtle)]"
        title="Notifications"
        aria-label={`Notifications${unreadCount ? ` (${unreadCount} unread)` : ""}`}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-4 min-h-4 px-1 bg-red-500 rounded-full text-[10px] font-mono text-white flex items-center justify-center tabular-nums"
            aria-hidden="true"
          >
            {unreadCount}
          </span>
        )}
      </button>

      {/* Notification Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-stretch justify-end"
            role="dialog"
            aria-modal="true"
            aria-label="Notifications and badges"
          >
            <div
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setIsOpen(false)}
            />
            <motion.div
              ref={panelRef}
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="relative w-full max-w-md h-full bg-[var(--surface-solid)] border-l border-terminal-border shadow-2xl overflow-hidden flex flex-col"
            >
              {/* Header */}
              <div className="p-4 border-b border-terminal-border flex items-center justify-between">
                <h2 className="text-lg font-bold text-white">নোটিফিকেশন</h2>
                <button
                  onClick={() => setIsOpen(false)}
                  className="w-10 h-10 flex items-center justify-center text-[var(--dashboard-text-muted)] hover:text-white transition-colors rounded-lg"
                  aria-label="বন্ধ করুন"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-terminal-border">
                {[
                  { id: "notifications" as Tab, label: "আলার্ট", icon: Bell },
                  { id: "badges" as Tab, label: "ব্যাজ", icon: Trophy },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-3.5 text-xs font-mono transition-colors ${
                      activeTab === tab.id
                        ? "text-[var(--dashboard-primary)] border-b-2 border-emerald-500"
                        : "text-[var(--dashboard-text-muted)] hover:text-[var(--dashboard-text-secondary)]"
                    }`}
                  >
                    <tab.icon className="w-3.5 h-3.5" />
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-4">
                {loading ? (
                  <div className="text-center py-12 text-[var(--dashboard-text-muted)] font-mono text-sm">
                    লোড হচ্ছে...
                  </div>
                ) : activeTab === "notifications" ? (
                  notifications.length === 0 ? (
                    <div className="text-center py-12">
                      <Bell className="w-10 h-10 mx-auto mb-3 text-zinc-700" />
                      <p className="text-sm text-[var(--dashboard-text-muted)]">কোনো নোটিফিকেশন নেই</p>
                    </div>
                  ) : (
                    <AnimatedList
                      items={notifications}
                      keyExtractor={(n) => String(n.id)}
                      className="space-y-2"
                      renderItem={(notif) => {
                        const TypeIcon = TYPE_ICONS[notif.type] ?? Megaphone;
                        return (
                          <div
                            role={notif.read ? undefined : "button"}
                            tabIndex={notif.read ? undefined : 0}
                            aria-label={
                              notif.read ? notif.title : `${notif.title} — পড়া হিসেবে চিহ্নিত করুন`
                            }
                            onKeyDown={(e) => {
                              if (!notif.read && (e.key === "Enter" || e.key === " ")) {
                                e.preventDefault();
                                void markAsRead(notif.id);
                              }
                            }}
                            className={`p-3 rounded-2xl border transition-all ${
                              notif.read ? "border-[var(--dashboard-border-muted)] bg-subtle" : "border-emerald-500/20 bg-[var(--dashboard-primary-subtle)] cursor-pointer"
                            }`}
                            onClick={() => void markAsRead(notif.id)}
                          >
                            <div className="flex items-start gap-3">
                              <span
                                className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                                  notif.type === "WARNING"
                                    ? "bg-[var(--dashboard-warning-subtle)] text-[var(--dashboard-warning)]"
                                    : notif.type === "SUCCESS"
                                      ? "bg-[var(--dashboard-primary-subtle)] text-[var(--dashboard-primary)]"
                                      : "bg-zinc-800 text-[var(--dashboard-text-muted)]"
                                }`}
                              >
                                <TypeIcon className="w-4 h-4" aria-hidden="true" />
                              </span>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <h4 className="text-sm font-medium text-white truncate">{notif.title}</h4>
                                  {!notif.read && (
                                    <span className="w-2 h-2 bg-emerald-500 rounded-full flex-shrink-0" aria-label="unread" />
                                  )}
                                </div>
                                <p className="text-xs text-[var(--dashboard-text-muted)] font-mono">{notif.message}</p>
                                <span className="text-[10px] text-[var(--dashboard-text-secondary)] font-mono mt-1 block">
                                  {relativeTime(notif.timestamp)}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      }}
                    />
                  )
                ) : badges.length === 0 ? (
                  <div className="text-center py-12">
                    <Medal className="w-10 h-10 mx-auto mb-3 text-zinc-700" />
                    <p className="text-sm text-[var(--dashboard-text-muted)]">কোনো ব্যাজ নেই</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {badges.map((badge) => (
                      <motion.div
                        key={badge.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`p-3 rounded-2xl border ${
                          badge.unlocked
                            ? "border-emerald-500/20 bg-[var(--dashboard-primary-subtle)]"
                            : "border-[var(--dashboard-border-muted)] bg-subtle opacity-60"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-2xl" aria-hidden="true">
                            {badge.icon}
                          </span>
                          <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-medium text-white">{badge.name}</h4>
                            <p className="text-xs text-[var(--dashboard-text-muted)] font-mono">{badge.description}</p>
                          </div>
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-zinc-500/10 text-[var(--dashboard-text-muted)]">
                            {badge.unlocked ? "অর্জিত" : "অর্জন করা হয়নি"}
                          </span>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
