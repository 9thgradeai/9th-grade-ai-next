/* src/components/FlashNewsModal.tsx */
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Client } from "@/lib/types";
import { Volume2, Bookmark, BookmarkCheck, X, Clock, Calendar } from "lucide-react";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";

type Props = {
  news: Client.FlashNews | null;
  onClose: () => void;
};

function FlashNewsModalContent({ news, onClose }: Props) {
  const [savedByNews, setSavedByNews] = useState<Record<string, boolean>>({});
  const [audioByNews, setAudioByNews] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!news) return;
    void (async () => {
      await Promise.resolve();
      setIsLoading(false);
      setError(null);
    })();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    panelRef.current?.querySelector<HTMLElement>("button")?.focus();

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [news, onClose]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
    },
    [],
  );

  if (!news) return null;

  const readTime = news.readTime ?? 1;
  const isSaved = savedByNews[news.id] ?? false;
  const isAudioPlaying = audioByNews[news.id] ?? false;

  const toggleSaved = () => setSavedByNews((prev) => ({ ...prev, [news.id]: !isSaved }));
  const toggleAudio = () => setAudioByNews((prev) => ({ ...prev, [news.id]: !isAudioPlaying }));

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="text-emerald-400 font-mono">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-red-400 font-mono text-sm mb-4">{error}</p>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-zinc-900 border border-emerald-500/30 rounded-terminal-rounded text-emerald-400 font-mono text-sm hover:bg-emerald-500/10 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-label={`News: ${news.title.bn}`}
      >
        <motion.div
          ref={panelRef}
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.3 }}
          className="w-full max-w-2xl bg-zinc-950 rounded-2xl border border-emerald-500/30 overflow-hidden"
          onClick={handleBackdropClick}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-emerald-500/10">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/30 rounded text-xs font-mono text-emerald-400">
                {news.category?.bn ?? "NEWS"}
              </span>
              <span className="text-sm font-medium text-emerald-400">{news.tag}</span>
            </div>
            <button
              onClick={onClose}
              className="p-1 text-zinc-400 hover:text-emerald-400 transition-colors rounded-lg hover:bg-emerald-500/10"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            {/* Title */}
            <h2 className="text-xl font-bold text-white leading-tight">
              {news.title.bn}
              {news.title.en && (
                <span className="block text-sm text-zinc-400 font-mono mt-1">
                  {news.title.en}
                </span>
              )}
            </h2>

            {/* Meta */}
            <div className="flex flex-wrap gap-4 text-xs text-zinc-500 font-mono">
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" aria-hidden="true" />
                {news.date ?? "আজ"}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" aria-hidden="true" />
                {readTime} মিনিট পড়াশোনা
              </span>
            </div>

            {/* Full content */}
            <div className="space-y-4 text-zinc-300">
              <p className="whitespace-pre-wrap">{news.full ?? news.text}</p>
            </div>

            {/* Action bar */}
            <div className="flex flex-wrap gap-3 pt-4 border-t border-emerald-500/10">
              <button
                onClick={toggleAudio}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 font-mono text-sm hover:bg-emerald-500/20 transition-colors"
                aria-label={isAudioPlaying ? "Stop audio" : "Play audio"}
              >
                <Volume2 className="w-4 h-4" aria-hidden="true" />
                {isAudioPlaying ? "থামুন" : "শুনুন"}
              </button>

              <button
                onClick={toggleSaved}
                className="flex items-center gap-2 px-4 py-2 bg-zinc-900 border border-emerald-500/20 rounded-lg text-zinc-400 font-mono text-sm hover:border-emerald-500/40 hover:text-emerald-400 transition-colors"
                aria-label={isSaved ? "Remove bookmark" : "Add bookmark"}
              >
                {isSaved ? (
                  <BookmarkCheck className="w-4 h-4 text-emerald-400" aria-hidden="true" />
                ) : (
                  <Bookmark className="w-4 h-4" aria-hidden="true" />
                )}
                {isSaved ? "সেভ করা হয়েছে" : "সেভ করুন"}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export const FlashNewsModal: React.FC<Props> = ({ news, onClose }) => (
  <ErrorBoundary
    fallback={(error, reset) => (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-red-400 font-mono text-sm mb-4">{error.message}</p>
          <button
            onClick={reset}
            className="px-4 py-2 bg-zinc-900 border border-emerald-500/30 rounded-terminal-rounded text-emerald-400 font-mono text-sm hover:bg-emerald-500/10 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    )}
  >
    {news ? <FlashNewsModalContent news={news} onClose={onClose} /> : null}
  </ErrorBoundary>
);

export default FlashNewsModal;
