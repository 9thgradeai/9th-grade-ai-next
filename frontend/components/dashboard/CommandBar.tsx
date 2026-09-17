"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LightningA,
  Target,
  Brain,
  BookOpen,
  Calendar,
  Sparkle,
  MagnifyingGlass,
  ArrowRight,
  CircleNotch,
} from "@phosphor-icons/react";
import { TABS, type TabId } from "@/lib/data";
import { TAB_ICONS } from "@/lib/exam-ui";
import { useDashboardStore } from "@/lib/store-ctx/dashboard";
import { api } from "@/lib/services/api";
import { launchAI } from "@/lib/ai-launcher";
import type { Server } from "@/lib/types";

type CommandItem = {
  key: string;
  label: string;
  sub?: string;
  keywords: string;
  run: () => void;
  icon?: React.ComponentType<{ className?: string }>;
  emoji?: string;
};

type CommandSection = {
  id: string;
  title: string;
  items: CommandItem[];
};

const QUICK_ACTION_DEFS: {
  id: string;
  label: string;
  bn: string;
  keywords: string;
  icon: React.ComponentType<{ className?: string }>;
  run: (ctx: ActionCtx) => void;
}[] = [
  {
    id: "act:practice",
    label: "Start Practice",
    bn: "প্র্যাকটিস শুরু করুন",
    keywords: "practice start quick প্র্যাকটিস",
    icon: LightningA,
    run: ({ setPracticeIntent, go }) => {
      setPracticeIntent({ mode: "quick" });
      go("practice");
    },
  },
  {
    id: "act:mock",
    label: "Take Mock Test",
    bn: "মক টেস্ট দিন",
    keywords: "mock test timed মক",
    icon: LightningA,
    run: ({ setPracticeIntent, go }) => {
      setPracticeIntent({ mode: "mock" });
      go("practice");
    },
  },
  {
    id: "act:mistakes",
    label: "Review Mistakes",
    bn: "ভুলগুলো রিভিউ করুন",
    keywords: "mistakes wrong review ভুল",
    icon: Target,
    run: ({ setMistakeIntent, go }) => {
      setMistakeIntent(null);
      go("mistakes");
    },
  },
  {
    id: "act:flashcards",
    label: "Review Flashcards",
    bn: "ফ্ল্যাশকার্ড রিভিউ",
    keywords: "flashcards srs review ফ্ল্যাশকার্ড",
    icon: Brain,
    run: ({ go }) => go("flashcards"),
  },
  {
    id: "act:bank",
    label: "Open Question Bank",
    bn: "প্রশ্নব্যাংক খুলুন",
    keywords: "question bank প্রশ্নব্যাংক",
    icon: BookOpen,
    run: ({ go }) => go("question-bank"),
  },
  {
    id: "act:planner",
    label: "Open Study Planner",
    bn: "স্টাডি প্ল্যানার",
    keywords: "planner plan study প্ল্যানার",
    icon: Calendar,
    run: ({ go }) => go("study-planner"),
  },
  {
    id: "act:ai",
    label: "Ask AI Tutor",
    bn: "এআই টিউটরকে জিজ্ঞেস করুন",
    keywords: "ai tutor ask solve এআই",
    icon: Sparkle,
    run: () => launchAI({ mode: "tutor" }),
  },
];

type ActionCtx = {
  setPracticeIntent: (v: { mode: "quick" | "mock" | "custom"; subject?: string } | null) => void;
  setMistakeIntent: (v: { subject?: string; status?: string } | null) => void;
  go: (tab: TabId) => void;
};

function matches(query: string, ...fields: string[]) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = fields.join(" ").toLowerCase();
  return q.split(/\s+/).every((token) => hay.includes(token));
}

function truncate(text: string, max = 64) {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export default function CommandBar() {
  const router = useRouter();
  const { setActiveTab, setPracticeIntent, setMistakeIntent } = useDashboardStore();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [active, setActive] = useState(0);
  const [mistakes, setMistakes] = useState<Server.MistakeItemDTO[]>([]);
  const [papers, setPapers] = useState<{ id: number; titleBn: string; titleEn: string }[]>([]);
  const [contentLoading, setContentLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const go = useCallback(
    (tab: TabId) => {
      setActiveTab(tab);
      router.push(`/dashboard?tab=${tab}`);
    },
    [router, setActiveTab],
  );

  const quickActions: CommandItem[] = useMemo(
    () =>
      QUICK_ACTION_DEFS.map((a) => ({
        key: a.id,
        label: a.label,
        sub: a.bn,
        keywords: `${a.label} ${a.bn} ${a.keywords}`,
        icon: a.icon,
        run: () => a.run({ setPracticeIntent, setMistakeIntent, go }),
      })),
    [go, setPracticeIntent, setMistakeIntent],
  );

  const destinations: CommandItem[] = useMemo(
    () =>
      TABS.map((t, i) => ({
        key: `tab:${t.id}`,
        label: t.label,
        sub: `${t.bengali} · ${i + 1 <= 9 ? i + 1 : 0}`,
        keywords: `${t.label} ${t.bengali} ${t.id}`,
        icon: TAB_ICONS[t.id],
        run: () => go(t.id),
      })),
    [go],
  );

  // Debounce the query before hitting content APIs.
  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedQuery(query), 250);
    return () => window.clearTimeout(id);
  }, [query]);

  // Live content search over real user data (mistakes) + exam library papers.
  // Only runs for queries of 2+ chars; shorter queries simply hide content
  // sections (stale results are cleared when the palette opens/closes).
  const searchActive = open && debouncedQuery.trim().length >= 2;
  useEffect(() => {
    if (!searchActive) return;
    const q = debouncedQuery.trim().toLowerCase();
    let cancelled = false;
    // Deferred so the effect body itself never sets state synchronously
    // (react-hooks/set-state-in-effect); runs before any fetch resolution.
    queueMicrotask(() => {
      if (!cancelled) setContentLoading(true);
    });
    void Promise.all([
      api.mistakes({ limit: 30, sort: "recent" }).catch(() => null),
      api.examPapers().catch(() => [] as { id: number; titleBn: string; titleEn: string }[]),
    ])
      .then(([mistakeRes, paperList]) => {
        if (cancelled) return;
        if (mistakeRes) {
          setMistakes(
            mistakeRes.data
              .filter((m) =>
                `${m.question?.question ?? ""} ${m.lastSubject} ${m.lastTopic}`
                  .toLowerCase()
                  .includes(q),
              )
              .slice(0, 5),
          );
        }
        setPapers(
          paperList
            .filter((p) => `${p.titleBn} ${p.titleEn}`.toLowerCase().includes(q))
            .slice(0, 5),
        );
      })
      .finally(() => {
        if (!cancelled) setContentLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [searchActive, debouncedQuery]);

  const sections: CommandSection[] = useMemo(() => {
    const q = query.trim();
    const filteredActions = quickActions.filter((c) => matches(q, c.keywords));
    const filteredTabs = destinations.filter((c) => matches(q, c.keywords));
    const out: CommandSection[] = [];
    if (filteredActions.length > 0)
      out.push({ id: "actions", title: q ? "Actions" : "Quick actions", items: filteredActions });
    if (filteredTabs.length > 0) out.push({ id: "tabs", title: "Go to", items: filteredTabs });
    if (searchActive) {
      if (mistakes.length > 0) {
        out.push({
          id: "mistakes",
          title: "Your mistakes",
          items: mistakes.map((m) => ({
            key: `mistake:${m.id}`,
            label: truncate(m.question?.question ?? m.lastTopic ?? "Mistake"),
            sub: [m.lastSubject, m.lastTopic].filter(Boolean).join(" · ") || undefined,
            keywords: "",
            icon: Target,
            run: () => {
              setMistakeIntent(m.lastSubject ? { subject: m.lastSubject } : null);
              go("mistakes");
            },
          })),
        });
      }
      if (papers.length > 0) {
        out.push({
          id: "papers",
          title: "Exam papers",
          items: papers.map((p) => ({
            key: `paper:${p.id}`,
            label: p.titleBn || p.titleEn,
            sub: p.titleEn && p.titleEn !== p.titleBn ? p.titleEn : undefined,
            keywords: "",
            icon: BookOpen,
            run: () => go("real-exam"),
          })),
        });
      }
    }
    return out;
  }, [query, searchActive, quickActions, destinations, mistakes, papers, go, setMistakeIntent]);

  const flat = useMemo(() => sections.flatMap((s) => s.items), [sections]);
  // Clamp instead of resetting via effect — async content arrives without
  // stealing the user's arrow position.
  const safeActive = Math.min(active, Math.max(flat.length - 1, 0));

  const openBar = () => {
    setQuery("");
    setDebouncedQuery("");
    setMistakes([]);
    setPapers([]);
    setActive(0);
    setOpen(true);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => {
          if (o) return false;
          queueMicrotask(openBar);
          return true;
        });
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

  // Keep the active option visible while arrowing.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${safeActive}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [safeActive]);

  if (!open) return null;

  const choose = (cmd: CommandItem | undefined) => {
    if (!cmd) return;
    setOpen(false);
    cmd.run();
  };

  const showContentState = query.trim().length >= 2;
  const empty =
    flat.length === 0 && !contentLoading;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center bg-[var(--overlay)] px-4 pt-[14vh] backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Command center"
      onClick={() => setOpen(false)}
    >
      <div
        className="card w-full max-w-lg overflow-hidden rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-default px-4">
          <MagnifyingGlass className="h-4 w-4 shrink-0 text-[var(--dashboard-text-muted)]" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, flat.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                choose(flat[safeActive]);
              } else if (e.key === "Escape") {
                setOpen(false);
              }
            }}
            placeholder="Type a command, destination, mistake, or paper…"
            aria-label="Command search"
            aria-expanded="true"
            aria-controls="command-results"
            aria-activedescendant={flat[safeActive] ? `cmd-${flat[safeActive].key}` : undefined}
            role="combobox"
            aria-autocomplete="list"
            className="flex-1 bg-transparent py-3.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--dashboard-text-muted)] focus:outline-none"
          />
          <kbd
            className="hidden rounded-md border px-1.5 py-0.5 font-mono text-[10px] sm:inline"
            style={{
              borderColor: "var(--dashboard-border-muted)",
              color: "var(--dashboard-text-muted)",
            }}
          >
            ESC
          </kbd>
        </div>
        <ul
          ref={listRef}
          id="command-results"
          role="listbox"
          aria-label="Results"
          className="max-h-[46vh] overflow-y-auto py-2"
        >
          {empty && (
            <li className="px-4 py-6 text-center">
              <p className="text-sm font-semibold text-[var(--dashboard-text-primary)]">
                No matches found
              </p>
              <p className="mt-1 text-xs text-[var(--dashboard-text-muted)]">
                Try a destination like “progress”, an action like “mock”, or at least 2
                characters to search your mistakes and papers.
              </p>
            </li>
          )}
          {sections.map((section) => (
            <li key={section.id} role="presentation">
              <p
                className="px-4 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.14em]"
                style={{ color: "var(--dashboard-text-muted)" }}
                aria-hidden="true"
              >
                {section.title}
              </p>
              {section.items.map((c) => {
                const idx = flat.indexOf(c);
                const isActive = idx === safeActive;
                const Icon = c.icon;
                return (
                  <div
                    key={c.key}
                    id={`cmd-${c.key}`}
                    role="option"
                    aria-selected={isActive}
                    data-idx={idx}
                  >
                    <button
                      type="button"
                      onMouseEnter={() => setActive(idx)}
                      onClick={() => choose(c)}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors focus-visible:outline-none"
                      style={
                        isActive
                          ? {
                              background: "var(--dashboard-primary-subtle)",
                              color: "var(--dashboard-primary)",
                            }
                          : { color: "var(--dashboard-text-secondary)" }
                      }
                    >
                      {Icon ? (
                        <Icon className="h-4 w-4 shrink-0" />
                      ) : c.emoji ? (
                        <span aria-hidden="true">{c.emoji}</span>
                      ) : null}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{c.label}</span>
                        {c.sub && (
                          <span
                            className="block truncate text-[11px]"
                            style={{ color: "var(--dashboard-text-muted)" }}
                          >
                            {c.sub}
                          </span>
                        )}
                      </span>
                      {isActive && <ArrowRight className="h-3.5 w-3.5 shrink-0 opacity-70" />}
                    </button>
                  </div>
                );
              })}
            </li>
          ))}
          {showContentState && contentLoading && (
            <li className="flex items-center gap-2 px-4 py-3 text-xs text-[var(--dashboard-text-muted)]">
              <CircleNotch className="h-3.5 w-3.5 animate-spin" /> Searching your content…
            </li>
          )}
        </ul>
        <div
          className="flex items-center gap-4 border-t border-default px-4 py-2.5 text-[11px]"
          style={{ color: "var(--dashboard-text-muted)" }}
        >
          <span>
            <kbd className="font-mono">↑↓</kbd> navigate
          </span>
          <span>
            <kbd className="font-mono">↵</kbd> select
          </span>
          <span className="hidden sm:inline">
            <kbd className="font-mono">⌘K</kbd> toggle
          </span>
          <span className="ml-auto hidden sm:inline">1–9, 0 jump to tabs</span>
        </div>
      </div>
    </div>
  );
}
