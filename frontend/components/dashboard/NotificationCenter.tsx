"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, X, Trophy } from "lucide-react";
import { api } from "@/lib/services/api";
import type { Server } from "@/lib/types";

type Tab = "notifications" | "badges";

const TYPE_ICONS: Record<string, string> = {
  SUCCESS: "✅",
  WARNING: "⚠️",
  INFO: "ℹ️",
  REMINDER: "🔔",
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
        onClick={() => setIsOpen(true)}
        className="relative p-2 text-zinc-400 hover:text-emerald-400 transition-colors rounded-lg hover:bg-emerald-500/5"
        title="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 rounded-full text-[10px] font-mono text-white flex items-center justify-center">
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
            className="fixed inset-0 z-50 flex items-center justify-end"
          >
            <div
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setIsOpen(false)}
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="relative w-full max-w-md h-full bg-zinc-950 border-l border-terminal-border shadow-2xl overflow-hidden flex flex-col"
            >
              {/* Header */}
              <div className="p-4 border-b border-terminal-border flex items-center justify-between">
                <h2 className="text-lg font-bold text-white">নোটিফিকেশন</h2>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 text-zinc-400 hover:text-white transition-colors"
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
                    className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-mono transition-colors ${
                      activeTab === tab.id
                        ? "text-emerald-400 border-b-2 border-emerald-500"
                        : "text-zinc-500 hover:text-zinc-300"
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
                  <div className="text-center py-12 text-zinc-500 font-mono text-sm">
                    লোড হচ্ছে...
                  </div>
                ) : activeTab === "notifications" ? (
                  notifications.length === 0 ? (
                    <div className="text-center py-12">
                      <p className="text-3xl mb-3">🔔</p>
                      <p className="text-sm text-zinc-500">কোনো নোটিফিকেশন নেই</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {notifications.map((notif) => (
                        <motion.div
                          key={notif.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className={`p-3 rounded-2xl border transition-all cursor-pointer ${
                            notif.read ? "border-zinc-800 bg-zinc-900/30" : "border-emerald-500/20 bg-emerald-500/5"
                          }`}
                          onClick={() => void markAsRead(notif.id)}
                        >
                          <div className="flex items-start gap-3">
                            <span className="text-lg flex-shrink-0">{TYPE_ICONS[notif.type] ?? "📢"}</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <h4 className="text-sm font-medium text-white truncate">{notif.title}</h4>
                                {!notif.read && (
                                  <span className="w-2 h-2 bg-emerald-500 rounded-full flex-shrink-0" />
                                )}
                              </div>
                              <p className="text-xs text-zinc-400 font-mono">{notif.message}</p>
                              <span className="text-[10px] text-zinc-600 font-mono mt-1 block">
                                {relativeTime(notif.timestamp)}
                              </span>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )
                ) : badges.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-3xl mb-3">🏅</p>
                    <p className="text-sm text-zinc-500">কোনো ব্যাজ নেই</p>
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
                            ? "border-emerald-500/20 bg-emerald-500/5"
                            : "border-zinc-800 bg-zinc-900/30 opacity-60"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{badge.icon}</span>
                          <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-medium text-white">{badge.name}</h4>
                            <p className="text-xs text-zinc-500 font-mono">{badge.description}</p>
                          </div>
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-zinc-500/10 text-zinc-400">
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