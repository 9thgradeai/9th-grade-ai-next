"use client";
import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, ArrowRight, Command as CmdIcon } from "lucide-react";
import { getCommands } from "@/lib/navigation";

export default function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const commands = useMemo(() => getCommands(), []);
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return commands.slice(0, 8);
    return commands.filter(c => c.label.toLowerCase().includes(s) || c.keywords.includes(s)).slice(0, 8);
  }, [q, commands]);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen(o => !o); }
      // "/" to open when not typing (optional quick open)
      if (!isTyping && e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); setOpen(true); }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("app:open-command", onOpen);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("app:open-command", onOpen); };
  }, []);
  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => {
      setQ("");
      setActive(0);
    });
    const id = window.setTimeout(() => inputRef.current?.focus(), 30);
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onEsc);
    return () => { window.clearTimeout(id); window.removeEventListener("keydown", onEsc); };
  }, [open, close]);
  // Keep active item visible
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;
  const go = (href: string, external?: boolean) => {
    close();
    if (external) window.open(href, "_blank", "noopener,noreferrer");
    else router.push(href);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[14vh] pb-4" role="dialog" aria-modal="true" aria-label="Command palette">
      <button aria-label="Close command palette" className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={close} />
      <div className="relative w-full max-w-[560px] overflow-hidden rounded-2xl border border-white/10 bg-[#0D0D0D] shadow-2xl">
        <div className="flex items-center gap-3 border-b border-white/10 px-4">
          <Search className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden="true" />
          <input
            ref={inputRef}
            value={q}
            onChange={e => { setQ(e.target.value); setActive(0); }}
            onKeyDown={e => {
              if (e.key === "ArrowDown") { e.preventDefault(); setActive(a => Math.min(a + 1, filtered.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
              else if (e.key === "Enter") { e.preventDefault(); const c = filtered[active]; if (c) go(c.href, c.external); }
            }}
            placeholder="Search navigation, ask AI, jump anywhere… (⌘K)"
            aria-label="Search commands"
            className="flex-1 bg-transparent py-4 text-sm text-white placeholder:text-zinc-500 focus:outline-none"
          />
          <span className="hidden sm:inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-1.5 py-1 text-[10px] font-mono text-zinc-400" aria-hidden="true"><CmdIcon className="h-3 w-3" />K</span>
        </div>
        <ul ref={listRef} className="max-h-[320px] overflow-y-auto py-2" role="listbox" aria-label="Results">
          {filtered.length === 0 && <li className="px-4 py-8 text-center text-sm text-zinc-500">No results for “{q}”</li>}
          {filtered.map((c, i) => (
            <li key={c.label + c.href} role="option" aria-selected={i === active} data-idx={i}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => go(c.href, c.external)}
                className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:bg-white/10 ${i === active ? "bg-white text-black" : "text-zinc-400 hover:bg-white/5 hover:text-white"}`}
              >
                <span className="flex items-center gap-3 truncate"><span className={`h-1.5 w-1.5 shrink-0 rounded-full ${i === active ? "bg-black" : "bg-white/20"}`} aria-hidden="true" />{c.label}</span>
                <span className="flex shrink-0 items-center gap-2 text-xs"><span className={`hidden sm:inline ${i === active ? "text-black/60" : "text-zinc-500"}`}>{c.group}</span><ArrowRight className={`h-3.5 w-3.5 ${i === active ? "opacity-100" : "opacity-0"}`} aria-hidden="true" /></span>
              </button>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between border-t border-white/10 px-4 py-2.5 text-[11px] text-zinc-500">
          <span className="flex gap-3"><span><kbd className="rounded border border-white/10 bg-white/5 px-1 py-0.5">↑↓</kbd> navigate</span><span><kbd className="rounded border border-white/10 bg-white/5 px-1 py-0.5">↵</kbd> open</span><span className="hidden sm:inline"><kbd className="rounded border border-white/10 bg-white/5 px-1 py-0.5">/</kbd> open</span></span>
          <span><kbd className="rounded border border-white/10 bg-white/5 px-1 py-0.5">ESC</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
