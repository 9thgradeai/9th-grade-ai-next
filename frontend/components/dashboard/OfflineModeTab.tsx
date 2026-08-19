"use client";

import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { Download, Trash2, Check, WifiOff, Wifi, HardDrive } from "lucide-react";
import { OFFLINE_PACKS } from "@/lib/data/study";
import { api } from "@/lib/services/api";

function getInitialOnline(): boolean {
  if (typeof window === "undefined") return true;
  return navigator.onLine;
}

export default function OfflineMode() {
  const [isOnline, setIsOnline] = useState(getInitialOnline);
  const [packs, setPacks] = useState(OFFLINE_PACKS);
  const [isDownloading, setIsDownloading] = useState<string | null>(null);

  // Load offline packs / documents from the database (fallback to static).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const docs = await api.documents();
        if (!cancelled && docs.length) {
          setPacks(
            docs.map((d) => ({
              id: String(d.id),
              name: d.title,
              subject: d.category || d.title,
              size: "0",
              downloaded: false,
            })),
          );
        }
      } catch {
        /* keep static fallback */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const storageUsed = useMemo(() => {
    const totalDownloaded = packs
      .filter((p) => p.downloaded)
      .reduce((sum, p) => sum + parseInt(p.size), 0);
    return `${totalDownloaded} MB`;
  }, [packs]);

  const downloadPack = async (packId: string) => {
    setIsDownloading(packId);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    setPacks((prev) =>
      prev.map((p) => (p.id === packId ? { ...p, downloaded: true } : p))
    );
    setIsDownloading(null);
  };

  const removePack = (packId: string) => {
    setPacks((prev) =>
      prev.map((p) => (p.id === packId ? { ...p, downloaded: false } : p))
    );
  };

  const downloadAll = async () => {
    for (const pack of packs) {
      if (!pack.downloaded) {
        await downloadPack(pack.id);
      }
    }
  };

  const downloadedCount = packs.filter((p) => p.downloaded).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card rounded-terminal-rounded border border-terminal-border p-5"
      >
        <div className="terminal-window-bar mb-4 border-b border-terminal-border">
          <div className="dot close" /><div className="dot minimize" /><div className="dot maximize" />
          <div className="flex-1 text-center text-xs text-zinc-400 font-mono">{"// OFFLINE_MODE"}</div>
        </div>

        <div className="flex items-center gap-2 mb-4">
          <HardDrive className="w-5 h-5 text-emerald-400" />
          <h2 className="text-lg font-bold text-white">Offline Mode</h2>
        </div>

        <div className="flex items-center justify-between p-4 bg-zinc-900/50 border border-emerald-500/20 rounded-terminal-rounded">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg border flex items-center justify-center ${
              isOnline ? "bg-emerald-500/10 border-emerald-500/20" : "bg-red-500/10 border-red-500/20"
            }`}>
              {isOnline ? (
                <Wifi className="w-5 h-5 text-emerald-400" />
              ) : (
                <WifiOff className="w-5 h-5 text-red-400" />
              )}
            </div>
            <div>
              <p className="text-sm font-medium text-white">
                {isOnline ? "Online" : "Offline"}
              </p>
              <p className="text-xs text-zinc-500 font-mono">
                {isOnline ? "Connected to server" : "Using downloaded content"}
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm font-mono text-emerald-400">{downloadedCount}/{packs.length}</div>
            <div className="text-[10px] text-zinc-500 font-mono">packages</div>
          </div>
        </div>

        {/* Storage Bar */}
        <div className="mt-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-zinc-500 font-mono">Storage Used</span>
            <span className="text-xs text-emerald-400 font-mono">{storageUsed}</span>
          </div>
          <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
            <motion.div
              animate={{ width: `${(downloadedCount / packs.length) * 100}%` }}
              className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full"
            />
          </div>
        </div>
      </motion.div>

      {/* Download All */}
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => {
              void downloadAll();
            }}
        disabled={packs.every((p) => p.downloaded)}
        className="w-full py-3 bg-emerald-500 text-zinc-950 font-mono rounded-lg hover:bg-emerald-400 transition-colors flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Download className="w-4 h-4" />
        Download All Content
      </motion.button>

      {/* Content Packs */}
      <div className="space-y-3">
        {packs.map((pack, i) => (
          <motion.div
            key={pack.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="glass-card rounded-terminal-rounded border border-terminal-border p-4"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg border flex items-center justify-center ${
                  pack.downloaded
                    ? "bg-emerald-500/10 border-emerald-500/20"
                    : "bg-zinc-900 border-zinc-800"
                }`}>
                  {pack.downloaded ? (
                    <Check className="w-5 h-5 text-emerald-400" />
                  ) : (
                    <Download className="w-5 h-5 text-zinc-500" />
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-medium text-white">{pack.name}</h3>
                  <p className="text-xs text-zinc-500 font-mono">{pack.subject} • {pack.size}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {pack.downloaded ? (
                  <button
                    onClick={() => removePack(pack.id)}
                    className="p-2 text-zinc-400 hover:text-red-400 transition-colors"
                    title="Remove"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                ) : (
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => {
                      void downloadPack(pack.id);
                    }}
                    disabled={isDownloading === pack.id}
                    className="px-3 py-1.5 bg-emerald-500 text-zinc-950 font-mono text-xs rounded hover:bg-emerald-400 transition-colors disabled:opacity-40"
                  >
                    {isDownloading === pack.id ? "Downloading..." : "Download"}
                  </motion.button>
                )}
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Tip */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-terminal-rounded"
      >
        <p className="text-sm text-zinc-300 font-mono">
          💡 Download content packs to study offline. Your progress will sync when you reconnect.
        </p>
      </motion.div>
    </div>
  );
}
