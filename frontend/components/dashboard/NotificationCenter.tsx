"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell,
  X,
  Trophy,
  CheckCircle,
  Info,
  Megaphone,
  Medal,
  Triangle,
  Trash,
  Checks,
  Funnel,
} from "@phosphor-icons/react";
import { api } from "@/lib/services/api";
import type { Server } from "@/lib/types";
import { AnimatedList } from "@/components/ui/AnimatedList";

type Tab = "notifications" | "badges";
type FilterType = "ALL" | "INFO" | "SUCCESS" | "WARNING" | "REMINDER";

const TYPE_ICONS: Record<string, typeof CheckCircle> = {
  SUCCESS: CheckCircle,
  WARNING: Triangle,
  INFO: Info,
  REMINDER: Bell,
};

const TYPE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  SUCCESS: { bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", border: "border-l-emerald-500" },
  WARNING: { bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400", border: "border-l-amber-500" },
  INFO: { bg: "bg-sky-500/10", text: "text-sky-600 dark:text-sky-400", border: "border-l-sky-500" },
  REMINDER: { bg: "bg-violet-500/10", text: "text-violet-600 dark:text-violet-400", border: "border-l-violet-500" },
};

const TYPE_LABELS: Record<string, string> = {
  ALL: "সব",
  INFO: "তথ্য",
  SUCCESS: "সফল",
  WARNING: "সতর্ক",
  REMINDER: "রিমাইন্ডার",
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
  const [unreadCount, setUnreadCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filterType, setFilterType] = useState<FilterType>("ALL");
  const [showFilters, setShowFilters] = useState(false);
  const [showPrefs, setShowPrefs] = useState(false);
  const [prefs, setPrefs] = useState({ info: true, success: true, warning: true, reminder: true });
  const panelRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLButtonElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchNotifications = useCallback(async (opts?: { limit?: number; cursor?: number; type?: string }) => {
    try {
      const result = await api.notifications(opts);
      if (!opts?.cursor) {
        setNotifications(result.notifications);
      } else {
        setNotifications((prev) => [...prev, ...result.notifications]);
      }
      setTotal(result.total);
      setNextCursor(result.nextCursor);
      setUnreadCount(result.unreadCount);
    } catch {
      // keep existing state
    }
  }, []);

  const fetchBadges = useCallback(async () => {
    try {
      const b = await api.badges();
      setBadges(b);
    } catch {
      // keep existing state
    }
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.allSettled([fetchNotifications(), fetchBadges()]);
    } finally {
      setLoading(false);
    }
  }, [fetchNotifications, fetchBadges]);

  // Fetch on mount and when opened
  useEffect(() => {
    if (isOpen) {
      void fetchAll();
    }
  }, [isOpen, fetchAll]);

  // Poll for new notifications every 30s while open
  useEffect(() => {
    if (!isOpen) {
      if (pollingRef.current) clearInterval(pollingRef.current);
      return;
    }
    pollingRef.current = setInterval(() => {
      void fetchNotifications({ type: filterType === "ALL" ? undefined : filterType });
    }, 30000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [isOpen, filterType, fetchNotifications]);

  // Focus trap + escape to close
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

  const filteredNotifications = filterType === "ALL"
    ? notifications
    : notifications.filter((n) => n.type === filterType);

  const markAsRead = async (id: number) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    setUnreadCount((prev) => Math.max(0, prev - 1));
    try {
      await api.markNotificationRead(id);
    } catch {
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: false } : n)));
      setUnreadCount((prev) => prev + 1);
    }
  };

  const markAllAsRead = async () => {
    const prev = notifications;
    const prevUnread = unreadCount;
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
    try {
      await api.markAllNotificationsRead();
    } catch {
      setNotifications(prev);
      setUnreadCount(prevUnread);
    }
  };

  const deleteNotification = async (id: number) => {
    const prev = notifications;
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    setTotal((prev) => prev - 1);
    try {
      await api.deleteNotification(id);
    } catch {
      setNotifications(prev);
      setTotal((p) => p + 1);
    }
  };

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      await fetchNotifications({
        cursor: nextCursor,
        limit: 20,
        type: filterType === "ALL" ? undefined : filterType,
      });
    } finally {
      setLoadingMore(false);
    }
  };

  const handleFilterChange = (type: FilterType) => {
    setFilterType(type);
    setShowFilters(false);
    // Refetch with new filter
    void fetchNotifications({ type: type === "ALL" ? undefined : type });
  };

  const loadPrefs = async () => {
    try {
      const result = await api.notificationPreferences();
      setPrefs(result.preferences);
    } catch {
      // keep defaults
    }
  };

  const togglePrefs = () => {
    setShowPrefs(!showPrefs);
    if (!showPrefs) void loadPrefs();
  };

  const updatePref = async (key: keyof typeof prefs, value: boolean) => {
    const prev = prefs;
    setPrefs((p) => ({ ...p, [key]: value }));
    try {
      await api.updateNotificationPreferences({ [key]: value });
    } catch {
      setPrefs(prev);
    }
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
            className="absolute -top-0.5 -right-0.5 min-w-4 min-h-4 px-1 bg-[var(--danger)] rounded-full text-[10px] font-mono text-[var(--text-primary)] flex items-center justify-center tabular-nums"
            aria-hidden="true"
          >
            {unreadCount > 99 ? "99+" : unreadCount}
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
              className="relative w-full max-w-md h-full bg-[var(--surface-solid)] border-l border-[var(--dashboard-border)] shadow-2xl overflow-hidden flex flex-col"
            >
              {/* Header */}
              <div className="p-4 border-b border-[var(--dashboard-border)]">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-lg font-bold text-[var(--text-primary)]">নোটিফিকেশন</h2>
                  <div className="flex items-center gap-1">
                    {unreadCount > 0 && (
                      <button
                        onClick={() => void markAllAsRead()}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[var(--dashboard-primary)] hover:bg-[var(--dashboard-primary-subtle)] rounded-lg transition-colors"
                        title="সব পড়া হিসেবে চিহ্নিত করুন"
                      >
                        <Checks className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">সব পড়া হয়েছে</span>
                      </button>
                    )}
                    <button
                      onClick={togglePrefs}
                      className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors ${
                        showPrefs
                          ? "bg-[var(--dashboard-primary-subtle)] text-[var(--dashboard-primary)]"
                          : "text-[var(--dashboard-text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-overlay)]"
                      }`}
                      title="পছন্দসমূহ"
                    >
                      <Funnel className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setIsOpen(false)}
                      className="w-9 h-9 flex items-center justify-center text-[var(--dashboard-text-muted)] hover:text-[var(--text-primary)] transition-colors rounded-lg hover:bg-[var(--surface-overlay)]"
                      aria-label="বন্ধ করুন"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 bg-[var(--surface-overlay)] rounded-lg p-0.5">
                  {[
                    { id: "notifications" as Tab, label: "আলার্ট", icon: Bell },
                    { id: "badges" as Tab, label: "ব্যাজ", icon: Trophy },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-md transition-all ${
                        activeTab === tab.id
                          ? "bg-[var(--surface-solid)] text-[var(--text-primary)] shadow-sm"
                          : "text-[var(--dashboard-text-muted)] hover:text-[var(--dashboard-text-secondary)]"
                      }`}
                    >
                      <tab.icon className="w-3.5 h-3.5" />
                      {tab.label}
                      {tab.id === "notifications" && unreadCount > 0 && (
                        <span className="ml-1 min-w-4 h-4 px-1 bg-[var(--accent)] rounded-full text-[9px] font-bold text-[var(--text-primary)] flex items-center justify-center">
                          {unreadCount > 99 ? "99+" : unreadCount}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Preferences Panel */}
              <AnimatePresence>
                {showPrefs && activeTab === "notifications" && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="border-b border-[var(--dashboard-border)] overflow-hidden"
                  >
                    <div className="p-3 bg-[var(--surface-overlay)]">
                      <p className="text-[10px] font-mono text-[var(--dashboard-text-muted)] mb-2 uppercase tracking-wider">
                        নোটিফিকেশন ধরন
                      </p>
                      <div className="space-y-1.5">
                        {(["info", "success", "warning", "reminder"] as const).map((key) => (
                          <label
                            key={key}
                            className="flex items-center justify-between cursor-pointer group"
                          >
                            <span className="text-xs text-[var(--dashboard-text-secondary)] capitalize">
                              {TYPE_LABELS[key.toUpperCase()] ?? key}
                            </span>
                            <button
                              role="switch"
                              aria-checked={prefs[key]}
                              onClick={() => void updatePref(key, !prefs[key])}
                              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                                prefs[key] ? "bg-[var(--accent)]" : "bg-[var(--surface-muted)]"
                              }`}
                            >
                              <span
                                className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                                  prefs[key] ? "translate-x-4.5" : "translate-x-0.5"
                                }`}
                              />
                            </button>
                          </label>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Filter Bar (notifications tab only) */}
              {activeTab === "notifications" && !showPrefs && (
                <div className="px-3 py-2 border-b border-[var(--dashboard-border)] bg-[var(--surface-overlay)]/50">
                  <div className="flex gap-1 overflow-x-auto">
                    {(["ALL", "SUCCESS", "WARNING", "INFO", "REMINDER"] as FilterType[]).map((type) => (
                      <button
                        key={type}
                        onClick={() => void handleFilterChange(type)}
                        className={`px-2.5 py-1 text-[10px] font-medium rounded-full whitespace-nowrap transition-colors ${
                          filterType === type
                            ? "bg-[var(--accent)] text-[var(--text-primary)]"
                            : "bg-[var(--surface-solid)] text-[var(--dashboard-text-muted)] hover:text-[var(--text-primary)] border border-[var(--dashboard-border)]"
                        }`}
                      >
                        {TYPE_LABELS[type]}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Content */}
              <div ref={scrollRef} className="flex-1 overflow-y-auto p-3">
                {loading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="animate-pulse rounded-xl border border-[var(--dashboard-border)] p-3">
                        <div className="flex gap-3">
                          <div className="w-8 h-8 rounded-lg bg-[var(--surface-overlay)]" />
                          <div className="flex-1 space-y-2">
                            <div className="h-3 bg-[var(--surface-overlay)] rounded w-3/4" />
                            <div className="h-2 bg-[var(--surface-overlay)] rounded w-full" />
                            <div className="h-2 bg-[var(--surface-overlay)] rounded w-1/3" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : activeTab === "notifications" ? (
                  filteredNotifications.length === 0 ? (
                    <div className="text-center py-16">
                      <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[var(--surface-overlay)] flex items-center justify-center">
                        <Bell className="w-8 h-8 text-[var(--text-muted)]" />
                      </div>
                      <p className="text-sm font-medium text-[var(--text-primary)] mb-1">কোনো নোটিফিকেশন নেই</p>
                      <p className="text-xs text-[var(--dashboard-text-muted)]">
                        {filterType !== "ALL" ? "এই ধরনের কোনো নোটিফিকেশন নেই" : "নতুন নোটিফিকেশন এখানে দেখা যাবে"}
                      </p>
                    </div>
                  ) : (
                    <>
                      <AnimatedList
                        items={filteredNotifications}
                        keyExtractor={(n) => String(n.id)}
                        className="space-y-2"
                        renderItem={(notif) => {
                          const TypeIcon = TYPE_ICONS[notif.type] ?? Megaphone;
                          const colors = TYPE_COLORS[notif.type] ?? { bg: "bg-[var(--surface-overlay)]", text: "text-[var(--dashboard-text-muted)]", border: "border-l-[var(--surface-muted)]" };
                          return (
                            <motion.div
                              layout
                              initial={{ opacity: 0, y: 8 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, x: 20 }}
                              className={`group relative rounded-xl border-l-4 border border-[var(--dashboard-border)] p-3 transition-all ${
                                notif.read
                                  ? "bg-[var(--surface-solid)] opacity-75 hover:opacity-100"
                                  : "bg-[var(--dashboard-primary-subtle)]/50 hover:bg-[var(--dashboard-primary-subtle)]"
                              } ${colors.border}`}
                            >
                              <div className="flex items-start gap-3">
                                <span
                                  className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${colors.bg} ${colors.text}`}
                                >
                                  <TypeIcon className="w-4 h-4" aria-hidden="true" />
                                </span>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-start justify-between gap-2">
                                    <h4 className="text-sm font-medium text-[var(--text-primary)] leading-tight">
                                      {notif.title}
                                    </h4>
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                      {!notif.read && (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            void markAsRead(notif.id);
                                          }}
                                          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-[var(--surface-overlay)] transition-all"
                                          title="পড়া হিসেবে চিহ্নিত করুন"
                                        >
                                          <CheckCircle className="w-3.5 h-3.5 text-[var(--accent)]" />
                                        </button>
                                      )}
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          void deleteNotification(notif.id);
                                        }}
                                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/10 transition-all"
                                        title="মুছুন"
                                      >
                                        <Trash className="w-3.5 h-3.5 text-red-500" />
                                      </button>
                                    </div>
                                  </div>
                                  <p className="text-xs text-[var(--dashboard-text-muted)] mt-0.5 leading-relaxed">
                                    {notif.message}
                                  </p>
                                  <span className="text-[10px] text-[var(--dashboard-text-secondary)] font-mono mt-1.5 block">
                                    {relativeTime(notif.timestamp)}
                                  </span>
                                </div>
                              </div>
                            </motion.div>
                          );
                        }}
                      />
                      {/* Load More */}
                      {nextCursor && (
                        <div className="mt-3 text-center">
                          <button
                            onClick={() => void loadMore()}
                            disabled={loadingMore}
                            className="px-4 py-2 text-xs font-medium text-[var(--dashboard-primary)] hover:bg-[var(--dashboard-primary-subtle)] rounded-lg transition-colors disabled:opacity-50"
                          >
                            {loadingMore ? "লোড হচ্ছে..." : "আরো দেখুন"}
                          </button>
                        </div>
                      )}
                      <div className="mt-3 text-center">
                        <span className="text-[10px] text-[var(--dashboard-text-secondary)] font-mono">
                          {total} টি নোটিফিকেশন
                        </span>
                      </div>
                    </>
                  )
                ) : badges.length === 0 ? (
                  <div className="text-center py-16">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[var(--surface-overlay)] flex items-center justify-center">
                      <Medal className="w-8 h-8 text-[var(--text-muted)]" />
                    </div>
                    <p className="text-sm font-medium text-[var(--text-primary)] mb-1">কোনো ব্যাজ নেই</p>
                    <p className="text-xs text-[var(--dashboard-text-muted)]">ব্যাজ অর্জন করলে এখানে দেখা যাবে</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {badges.map((badge) => (
                      <motion.div
                        key={badge.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`p-3 rounded-xl border transition-all ${
                          badge.unlocked
                            ? "border-[var(--accent)]/20 bg-[var(--dashboard-primary-subtle)]/50"
                            : "border-[var(--dashboard-border)] bg-[var(--surface-solid)] opacity-50"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-2xl" aria-hidden="true">
                            {badge.icon}
                          </span>
                          <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-medium text-[var(--text-primary)]">{badge.name}</h4>
                            <p className="text-xs text-[var(--dashboard-text-muted)]">{badge.description}</p>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                              badge.unlocked
                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                : "bg-[var(--surface-muted)] text-[var(--dashboard-text-muted)]"
                            }`}
                          >
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
