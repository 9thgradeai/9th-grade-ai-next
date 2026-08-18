"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, X, Trophy, Flame } from "lucide-react";
import { INITIAL_NOTIFICATIONS, BADGES, LEADERBOARD } from "@/lib/data/study";
import { api } from "@/lib/services/api";
import type { Notification } from "@/lib/types";

function toNotification(n: { id: string | number; title: string; message: string; type?: string; timestamp?: string | Date; read?: boolean }): Notification {
  return {
    id: String(n.id),
    title: n.title,
    message: n.message,
    type: (n.type as Notification["type"]) ?? "info",
    timestamp: typeof n.timestamp === "string" ? Date.parse(n.timestamp) || Date.now() : n.timestamp?.getTime?.() ?? Date.now(),
    read: n.read ?? false,
  };
}

type Tab = "notifications" | "badges" | "leaderboard";

export default function NotificationCenter() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("notifications");
  const [notifications, setNotifications] = useState<Notification[]>(INITIAL_NOTIFICATIONS);
  const [badges, setBadges] = useState(BADGES);

  // Load notifications + badges from the database (fallback to static data).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await api.notifications();
        if (!cancelled && list.length) setNotifications(list.map(toNotification));
      } catch {
        /* keep static fallback */
      }
      try {
        const b = await api.badges();
        if (!cancelled && b.length) setBadges(b.map((badge) => ({ ...badge, id: String(badge.id), rarity: badge.rarity as "common" | "rare" | "epic" | "legendary" })));
      } catch {
        /* keep static fallback */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAsRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  };

  const dismissNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const getTypeIcon = (type: Notification["type"]) => {
    switch (type) {
      case "success": return "✅";
      case "warning": return "⚠️";
      case "info": return "ℹ️";
      case "reminder": return "🔔";
      default: return "📢";
    }
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
                <h2 className="text-lg font-bold text-white">Notifications</h2>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 text-zinc-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-terminal-border">
                {[
                  { id: "notifications", label: "Alerts", icon: Bell },
                  { id: "badges", label: "Badges", icon: Trophy },
                  { id: "leaderboard", label: "Rankings", icon: Flame },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as Tab)}
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
                <AnimatePresence mode="wait">
                  {activeTab === "notifications" && (
                    <motion.div
                      key="notifications"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="space-y-2"
                    >
                      {notifications.length === 0 ? (
                        <div className="text-center py-12 text-zinc-500 font-mono text-sm">
                          No notifications
                        </div>
                      ) : (
                        notifications.map((notif) => (
                          <motion.div
                            key={notif.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={`p-3 rounded-terminal-rounded border transition-all ${
                              notif.read ? "border-zinc-800 bg-zinc-900/30" : "border-emerald-500/20 bg-emerald-500/5"
                            }`}
                            onClick={() => markAsRead(notif.id)}
                          >
                            <div className="flex items-start gap-3">
                              <span className="text-lg flex-shrink-0">{getTypeIcon(notif.type)}</span>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <h4 className="text-sm font-medium text-white truncate">{notif.title}</h4>
                                  {!notif.read && (
                                    <span className="w-2 h-2 bg-emerald-500 rounded-full flex-shrink-0" />
                                  )}
                                </div>
                                <p className="text-xs text-zinc-400 font-mono">{notif.message}</p>
                                <span className="text-[10px] text-zinc-600 font-mono mt-1 block">
                                  {new Date(notif.timestamp).toLocaleString()}
                                </span>
                              </div>
                              <button
                                onClick={(e) => { e.stopPropagation(); dismissNotification(notif.id); }}
                                className="p-1 text-zinc-600 hover:text-red-400 transition-colors flex-shrink-0"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          </motion.div>
                        ))
                      )}
                    </motion.div>
                  )}

                  {activeTab === "badges" && (
                    <motion.div
                      key="badges"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="space-y-2"
                    >
                      {badges.map((badge, i) => (
                        <motion.div
                          key={badge.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.05 }}
                          className={`p-3 rounded-terminal-rounded border ${
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
                              {badge.unlocked && badge.unlockedAt && (
                                <p className="text-[10px] text-emerald-400 font-mono mt-0.5">
                                  Unlocked: {badge.unlockedAt}
                                </p>
                              )}
                            </div>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                              badge.rarity === "legendary" ? "bg-amber-500/10 text-amber-400" :
                              badge.rarity === "epic" ? "bg-purple-500/10 text-purple-400" :
                              badge.rarity === "rare" ? "bg-sky-500/10 text-sky-400" :
                              "bg-zinc-500/10 text-zinc-400"
                            }`}>
                              {badge.rarity}
                            </span>
                          </div>
                        </motion.div>
                      ))}
                    </motion.div>
                  )}

                  {activeTab === "leaderboard" && (
                    <motion.div
                      key="leaderboard"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="space-y-1"
                    >
                      {LEADERBOARD.map((entry, i) => (
                        <motion.div
                          key={entry.name}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.05 }}
                          className={`flex items-center gap-3 p-3 rounded-terminal-rounded border ${
                            entry.rank <= 3
                              ? "border-amber-500/20 bg-amber-500/5"
                              : "border-zinc-800 bg-zinc-900/30"
                          }`}
                        >
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold font-mono ${
                            entry.rank === 1 ? "bg-amber-500/20 text-amber-400" :
                            entry.rank === 2 ? "bg-zinc-400/20 text-zinc-300" :
                            entry.rank === 3 ? "bg-orange-500/20 text-orange-400" :
                            "bg-zinc-800 text-zinc-500"
                          }`}>
                            {entry.rank}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-medium text-white truncate">{entry.name}</h4>
                            <div className="flex items-center gap-2 text-xs text-zinc-500 font-mono">
                              <span className="flex items-center gap-0.5">
                                <Flame className="w-3 h-3" /> {entry.streak}
                              </span>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-bold text-emerald-400 font-mono">{entry.points}</div>
                            <div className="text-[10px] text-zinc-500 font-mono">points</div>
                          </div>
                        </motion.div>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
