"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TABS, type TabId } from "@/lib/data";
import { useDashboardStore } from "@/lib/store-ctx/dashboard";

type Command = {
  id: string;
  label: string;
  hint: string;
  run: () => void;
};

const ACTIONS: { id: string; label: string; tab: TabId }[] = [
  { id: "act:practice", label: "প্র্যাকটিস শুরু করুন", tab: "practice" },
  { id: "act:mock", label: "মক টেস্ট শুরু করুন", tab: "practice" },
  { id: "act:bank", label: "প্রশ্নব্যাংক দেখুন", tab: "question-bank" },
  { id: "act:planner", label: "স্টাডি প্ল্যানার খুলুন", tab: "study-planner" },
  { id: "act:flash", label: "ফ্ল্যাশকার্ড রিভিউ", tab: "flashcards" },
];

export default function CommandBar() {
  const router = useRouter();
  const { setActiveTab } = useDashboardStore();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands = useMemo<Command[]>(() => {
    const tabs: Command[] = TABS.map((t) => ({
      id: `tab:${t.id}`,
      label: t.label,
      hint: "ট্যাব",
      run: () => {
        setActiveTab(t.id);
        router.push(`/dashboard?tab=${t.id}`);
      },
    }));
    const actions: Command[] = ACTIONS.map((a) => ({
      id: a.id,
      label: a.label,
      hint: "অ্যাকশন",
      run: () => {
        setActiveTab(a.tab);
        router.push(`/dashboard?tab=${a.tab}`);
      },
    }));
    return [...actions, ...tabs];
  }, [router, setActiveTab]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(
      (c) => c.label.toLowerCase().includes(q) || c.id.toLowerCase().includes(q),
    );
  }, [commands, query]);

  const openBar = () => {
    setQuery("");
    setActive(0);
    setOpen(true);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => openBar();
    window.addEventListener("keydown", onKey);
    window.addEventListener("app:open-command", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("app:open-command", onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const choose = (cmd: Command | undefined) => {
    if (!cmd) return;
    cmd.run();
    setOpen(false);
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center bg-[var(--overlay)] backdrop-blur-sm px-4 pt-[18vh]"
      role="dialog"
      aria-modal="true"
      aria-label="কমান্ড প্যানেল"
      onClick={() => setOpen(false)}
    >
      <div
        className="card w-full max-w-md rounded-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-default px-4">
          <span className="text-[var(--dashboard-text-muted)] font-mono text-sm">⌘K</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, filtered.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                choose(filtered[active]);
              } else if (e.key === "Escape") {
                setOpen(false);
              }
            }}
            placeholder="যেখানে যেতে চান খুঁজুন…"
            aria-label="কমান্ড অনুসন্ধান"
            className="flex-1 bg-transparent py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--dashboard-text-muted)] focus:outline-none"
          />
        </div>
        <ul className="max-h-72 overflow-y-auto py-2" role="listbox">
          {filtered.length === 0 && (
            <li className="px-4 py-3 text-xs text-[var(--dashboard-text-muted)]">কোনো ফলাফল মেলেনি</li>
          )}
          {filtered.map((c, i) => (
            <li key={c.id} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(c)}
                className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-sm transition-colors ${
                  i === active ? "bg-[var(--dashboard-primary-subtle)] text-[var(--dashboard-primary)]" : "text-[var(--dashboard-text-secondary)]"
                }`}
              >
                <span>{c.label}</span>
                <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--dashboard-text-muted)]">
                  {c.hint}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
