"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { Search, Menu, X, ChevronDown, LogOut, Settings, User as UserIcon, LayoutDashboard, Sparkles, Bell } from "lucide-react";
import BrandMark from "@/components/ui/BrandMark";
import LanguageToggle from "@/components/ui/LanguageToggle";
import { useAuth } from "@/lib/auth-ctx";
import { visibleMenus } from "@/lib/navigation";
import { useT } from "@/lib/i18n";
import { LanguageContext } from "@/lib/lang-ctx";
import { useContext } from "react";

function isActiveLink(href: string, pathname: string, tab: string | null): boolean {
  if (href.startsWith("/dashboard?tab=")) {
    const t = href.split("tab=")[1];
    return pathname === "/dashboard" && tab === t;
  }
  if (href.startsWith("/dashboard")) return pathname.startsWith("/dashboard");
  if (href.startsWith("/#")) return false;
  return pathname === href || pathname.startsWith(href + "/");
}

export default function AppNavbar() {
  const { user, logout } = useAuth();
  const t = useT();
  const lang = useContext(LanguageContext)?.lang ?? "en";
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const searchParams = useSearchParams();
  const tab = searchParams?.get("tab") ?? null;
  const isAuthed = !!user;

  const [openId, setOpenId] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);

  const headerRef = useRef<HTMLElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const desktopNavRef = useRef<HTMLDivElement>(null);
  const menus = visibleMenus(isAuthed);

  const closeAll = useCallback(() => { setOpenId(null); setProfileOpen(false); }, []);

  // Close on route change — deferred to avoid react-hooks/set-state-in-effect
  useEffect(() => {
    queueMicrotask(() => {
      closeAll();
      setMobileOpen(false);
    });
  }, [pathname, tab, closeAll]);
  // Body lock for mobile
  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [mobileOpen]);
  // Global Esc + outside click for desktop mega menu + profile
  useEffect(() => {
    if (!openId && !profileOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeAll(); };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (profileRef.current?.contains(t)) return;
      if (desktopNavRef.current?.contains(t)) return;
      if (headerRef.current?.contains(t) && openId) {
        // clicks inside header but not on nav triggers are handled by trigger toggles
        const isTrigger = (t as HTMLElement).closest?.("[data-nav-trigger]");
        if (isTrigger) return;
      }
      closeAll();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onDown); };
  }, [openId, profileOpen, closeAll]);
  // Mobile Esc
  useEffect(() => {
    if (!mobileOpen) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") setMobileOpen(false); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [mobileOpen]);

  const activeMenu = openId ? menus.find(m => m.id === openId) ?? null : null;

  return (
    <>
      <header
        ref={headerRef}
        className="fixed top-0 inset-x-0 z-50 pt-safe border-b border-transparent bg-transparent backdrop-blur-xl"
      >
        <nav className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8" aria-label={t("nav.primaryNavigation")}>
          <div className="flex h-14 sm:h-16 items-center gap-2">
            <Link href="/" className="flex shrink-0 items-center gap-2.5 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400" aria-label="9Th-Grade AI home">
              <BrandMark className="h-8 w-8 rounded-lg shadow-glow-sm" />
              <span className="hidden sm:inline font-display text-[15.5px] font-semibold tracking-tight text-white">9Th-Grade AI</span>
            </Link>

            {/* Desktop nav — keyboard: roving with Tab, open on click, Escape closes */}
            <div ref={desktopNavRef} className="hidden lg:flex items-center gap-1 ml-5" role="menubar" aria-label="Sections">
              {isAuthed && (
                <Link
                  href="/dashboard"
                  role="menuitem"
                  aria-current={pathname === "/dashboard" ? "page" : undefined}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 ${pathname.startsWith("/dashboard") ? "bg-white text-black" : "text-zinc-300 hover:bg-white/10 hover:text-white"}`}
                >
                  {t("nav.dashboard")}
                </Link>
              )}
              {menus.map(m => {
                const expanded = openId === m.id;
                const triggerId = `nav-trigger-${m.id}`;
                const panelId = `nav-panel-${m.id}`;
                return (
                  <button
                    key={m.id}
                    id={triggerId}
                    data-nav-trigger
                    role="menuitem"
                    aria-haspopup="menu"
                    aria-expanded={expanded}
                    aria-controls={panelId}
                    onClick={() => setOpenId(expanded ? null : m.id)}
                    className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 ${expanded ? "bg-white text-black" : "text-zinc-300 hover:bg-white/10 hover:text-white"}`}
                  >
                    {(m.labelBn && lang==="bn" ? m.labelBn : m.label)} {m.id === "ai" && <Sparkles className="h-3 w-3 text-violet-400" aria-hidden="true" />} <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
                  </button>
                );
              })}
            </div>

            <div className="flex-1" />

            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
              <button
                type="button"
                onClick={() => window.dispatchEvent(new Event("app:open-command"))}
                aria-label={t("nav.search")}
                className="hidden sm:inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-zinc-300 hover:border-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
              >
                <Search className="h-3.5 w-3.5" aria-hidden="true" /> <span className="hidden xl:inline">Search</span> <span className="hidden lg:inline-flex items-center gap-1 rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px]">⌘K</span>
              </button>
              <button
                type="button"
                onClick={() => window.dispatchEvent(new Event("app:open-command"))}
                aria-label={t("nav.search")}
                className="inline-flex sm:hidden p-2 rounded-full border border-white/10 text-zinc-300 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
              >
                <Search className="h-4 w-4" aria-hidden="true" />
              </button>

              <span className="hidden sm:inline-flex">
                <LanguageToggle className="border border-white/10 text-zinc-300 hover:border-white/15 hover:text-white text-xs" />
              </span>

              {!isAuthed ? (
                <>
                  <Link href="/login" className="hidden sm:inline-flex rounded-full border border-white/15 px-4 py-1.5 text-sm font-medium text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">{t("nav.login")}</Link>
                  <Link href="/login?register=true" className="inline-flex rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-black hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">{t("nav.getStarted")}</Link>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => router.push("/dashboard?tab=progress")}
                    aria-label={t("nav.notifications")}
                    className="hidden sm:inline-flex p-2 rounded-full border border-white/10 text-zinc-300 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                  >
                    <Bell className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <div ref={profileRef} className="relative">
                    <button
                      type="button"
                      onClick={() => setProfileOpen(v => !v)}
                      aria-expanded={profileOpen}
                      aria-haspopup="menu"
                      aria-controls="profile-menu"
                      className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 py-1 pl-1 pr-2.5 text-sm font-medium text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                    >
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 text-xs font-bold text-white" aria-hidden="true">{user?.name?.trim()?.charAt(0)?.toUpperCase() ?? "U"}</span>
                      <span className="hidden sm:inline max-w-[108px] truncate">{user?.name ?? "Account"}</span>
                      <ChevronDown className={`hidden sm:block h-3.5 w-3.5 text-zinc-400 transition-transform ${profileOpen ? "rotate-180" : ""}`} aria-hidden="true" />
                    </button>
                    {profileOpen && (
                      <div id="profile-menu" role="menu" aria-label={t("nav.account")} className="absolute right-0 mt-2 w-64 overflow-hidden rounded-2xl border border-white/10 bg-transparent backdrop-blur-2xl p-1.5 shadow-xl">
                        <div className="flex items-center gap-3 px-3 py-3">
                          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 text-sm font-bold text-white" aria-hidden="true">{user?.name?.trim()?.charAt(0)?.toUpperCase() ?? "U"}</span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-white">{user?.name}</p>
                            <p className="truncate text-xs text-zinc-500">{user?.email}</p>
                          </div>
                        </div>
                        <div className="my-1 h-px bg-white/10" />
                        <Link href="/dashboard" role="menuitem" onClick={closeAll} className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-zinc-300 hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"><LayoutDashboard className="h-4 w-4" aria-hidden="true" /> {t("nav.dashboard")}</Link>
                        <Link href="/dashboard?tab=settings" role="menuitem" onClick={closeAll} className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-zinc-300 hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"><Settings className="h-4 w-4" aria-hidden="true" /> {t("auth.settings")}</Link>
                        <Link href="/about" role="menuitem" onClick={closeAll} className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-zinc-300 hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"><UserIcon className="h-4 w-4" aria-hidden="true" /> {t("nav.about")}</Link>
                        <div className="my-1 h-px bg-white/10" />
                        <button role="menuitem" onClick={() => { closeAll(); void logout(); }} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm text-red-400 hover:bg-red-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"><LogOut className="h-4 w-4" aria-hidden="true" /> {t("auth.logout")}</button>
                      </div>
                    )}
                  </div>
                </>
              )}

              <button
                type="button"
                onClick={() => setMobileOpen(v => !v)}
                aria-label={mobileOpen ? "Close menu" : "Open menu"}
                aria-expanded={mobileOpen}
                aria-controls="mobile-drawer"
                className="inline-flex lg:hidden p-2 rounded-xl border border-white/10 text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
              >
                {mobileOpen ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
              </button>
            </div>
          </div>
        </nav>

        {/* Desktop mega panel — compact, not giant */}
        {activeMenu && (
          <div
            id={`nav-panel-${activeMenu.id}`}
            role="menu"
            aria-labelledby={`nav-trigger-${activeMenu.id}`}
            className="hidden lg:block border-t border-white/10 bg-transparent backdrop-blur-2xl"
          >
            <div className="mx-auto max-w-[1440px] px-6 lg:px-8 py-6">
              <div className="grid grid-cols-12 gap-6">
                <div className="col-span-3">
                  <p className="text-xs font-bold tracking-[0.14em] uppercase text-violet-300">{(activeMenu.labelBn && lang==="bn" ? activeMenu.labelBn : activeMenu.label)}</p>
                  {activeMenu.highlight && (
                    <div className="mt-4 rounded-2xl border border-white/10 bg-gradient-to-br from-violet-500/15 via-indigo-500/10 to-transparent p-4">
                      <p className="text-sm font-semibold text-white">{activeMenu.highlight.title}</p>
                      <p className="mt-1 text-xs leading-relaxed text-zinc-400">{activeMenu.highlight.desc}</p>
                      <Link href={activeMenu.highlight.href} onClick={closeAll} className="mt-3 inline-flex items-center gap-1 rounded-full bg-white px-3.5 py-1.5 text-xs font-semibold text-black hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">{activeMenu.highlight.cta} →</Link>
                    </div>
                  )}
                </div>
                <div className="col-span-9 grid gap-6" style={{ gridTemplateColumns: `repeat(${Math.min(activeMenu.groups.length, 3)}, minmax(0,1fr))` }}>
                  {activeMenu.groups.map(g => (
                    <div key={g.label}>
                      <p className="mb-3 text-[11px] font-bold tracking-[0.12em] uppercase text-zinc-500">{g.label}</p>
                      <ul className="space-y-1" role="none">
                        {g.items.map(it => {
                          const Icon = it.icon;
                          const active = isActiveLink(it.href, pathname, tab);
                          return (
                            <li key={it.label} role="none">
                              <Link
                                href={it.href}
                                role="menuitem"
                                target={it.external ? "_blank" : undefined}
                                rel={it.external ? "noopener noreferrer" : undefined}
                                aria-current={active ? "page" : undefined}
                                onClick={closeAll}
                                className={`group flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 ${active ? "bg-white text-black" : "hover:bg-white/5 text-white"}`}
                              >
                                {Icon && (
                                  <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors ${active ? "bg-black/5 border-black/10 text-black" : "bg-white/5 border-white/10 text-zinc-300 group-hover:bg-white group-hover:text-black"}`} aria-hidden="true">
                                    <Icon className="h-4 w-4" />
                                  </span>
                                )}
                                <span className="min-w-0">
                                  <span className={`flex items-center gap-1 text-sm font-medium ${active ? "text-black" : "text-white"}`}>{it.label}</span>
                                  {it.desc && <span className={`line-clamp-1 text-xs ${active ? "text-black/60" : "text-zinc-500"}`}>{it.desc}</span>}
                                </span>
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Mobile drawer — independent design, not shrunken desktop */}
      {mobileOpen && (
        <div className="fixed inset-0 z-[60] lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button aria-label="Close navigation" className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div id="mobile-drawer" className="absolute right-0 top-0 bottom-0 flex w-[88%] max-w-[380px] flex-col overflow-hidden border-l border-white/10 bg-transparent backdrop-blur-2xl pt-safe">
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 px-4">
              <span className="flex items-center gap-2 font-display font-semibold text-white"><BrandMark className="h-7 w-7 rounded-lg" aria-hidden="true" /> 9Th-Grade AI</span>
              <button type="button" onClick={() => setMobileOpen(false)} aria-label="Close navigation" className="p-2 rounded-xl border border-white/10 text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"><X className="h-4 w-4" aria-hidden="true" /></button>
            </div>
            <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-3 space-y-1 pb-safe">
              {isAuthed && (
                <Link href="/dashboard" onClick={() => setMobileOpen(false)} aria-current={pathname.startsWith("/dashboard") ? "page" : undefined} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold ${pathname.startsWith("/dashboard") ? "bg-white text-black" : "bg-white/5 text-white"}`}><LayoutDashboard className="h-4 w-4" aria-hidden="true" /> {t("nav.dashboard")}</Link>
              )}
              {menus.map(m => {
                const expanded = mobileExpanded === m.id;
                return (
                  <div key={m.id} className="rounded-xl border border-white/5 bg-white/[0.02]">
                    <button
                      type="button"
                      onClick={() => setMobileExpanded(expanded ? null : m.id)}
                      aria-expanded={expanded}
                      aria-controls={`mob-${m.id}`}
                      className="flex w-full items-center justify-between px-3 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 rounded-xl"
                    >
                      <span className="flex items-center gap-2 text-sm font-semibold text-white">{(m.labelBn && lang==="bn" ? m.labelBn : m.label)}{m.id === "ai" && <Sparkles className="h-3.5 w-3.5 text-violet-400" aria-hidden="true" />}</span>
                      <ChevronDown className={`h-4 w-4 text-zinc-500 transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
                    </button>
                    {expanded && (
                      <div id={`mob-${m.id}`} className="px-2 pb-3 space-y-3">
                        {m.highlight && <Link href={m.highlight.href} onClick={() => setMobileOpen(false)} className="block rounded-xl border border-violet-500/20 bg-violet-500/10 px-3 py-2.5 text-sm font-medium text-white">{m.highlight.cta} — {m.highlight.title}</Link>}
                        {m.groups.map(g => (
                          <div key={g.label}>
                            <p className="px-2 py-1 text-[11px] font-bold tracking-widest uppercase text-zinc-500">{g.label}</p>
                            {g.items.map(it => {
                              const active = isActiveLink(it.href, pathname, tab);
                              return (
                                <Link key={it.label} href={it.href} target={it.external ? "_blank" : undefined} rel={it.external ? "noopener noreferrer" : undefined} aria-current={active ? "page" : undefined} onClick={() => setMobileOpen(false)} className={`flex min-h-[44px] items-center gap-2.5 rounded-lg px-2 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 ${active ? "bg-white text-black" : "text-zinc-300 hover:bg-white/5 hover:text-white"}`}>
                                  {it.icon && <it.icon className="h-4 w-4 shrink-0 opacity-70" aria-hidden="true" />}{it.label}
                                </Link>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="shrink-0 space-y-2 border-t border-white/10 p-3 pb-safe">
              <div className="flex justify-center"><LanguageToggle className="rounded-full border border-white/10 px-3 py-2 text-xs text-zinc-300 hover:text-white" /></div>
              {!isAuthed ? (
                <div className="grid grid-cols-2 gap-2">
                  <Link href="/login" onClick={() => setMobileOpen(false)} className="rounded-full border border-white/15 py-3 text-center text-sm font-medium text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">{t("nav.login")}</Link>
                  <Link href="/login?register=true" onClick={() => setMobileOpen(false)} className="rounded-full bg-white py-3 text-center text-sm font-semibold text-black hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">{t("nav.getStarted")}</Link>
                </div>
              ) : (
                <div className="flex items-center gap-3 px-2 py-1">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 text-xs font-bold text-white" aria-hidden="true">{user?.name?.trim()?.charAt(0)?.toUpperCase() ?? "U"}</span>
                  <span className="truncate text-sm font-medium text-white">{user?.name}</span>
                  <button type="button" onClick={() => { setMobileOpen(false); void logout(); }} className="ml-auto rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:text-white">{t("auth.logout")}</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
