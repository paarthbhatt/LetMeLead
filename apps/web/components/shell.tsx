"use client";

import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import {
  ArrowRight,
  Building2,
  ChevronRight,
  CircleHelp,
  Coins,
  Keyboard,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Radio,
  Search,
  Sparkles,
  Sun,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";

import { api } from "@/lib/api";
import { clearSession, getSession, setSession } from "@/lib/auth";
import { filterCommands, getNavigationContext, isNavigationActive, moveCommandSelection, NAVIGATION_GROUPS, NAVIGATION_ITEMS, type SearchableCommand } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { useTheme, type ThemePreference } from "./providers";
import { Avatar, Badge, Button, Dialog, Input, Notice, Select, Skeleton } from "./ui";

type Identity = Awaited<ReturnType<typeof api.me>>;
type Workspace = Awaited<ReturnType<typeof api.tenant>>;
type Credits = Awaited<ReturnType<typeof api.credits>>;

const THEMES: { value: ThemePreference; label: string; icon: LucideIcon }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

function ThemePicker() {
  const { theme, setTheme } = useTheme();
  return (
    <div role="group" aria-label="Appearance" className="flex gap-1 rounded-lg border bg-surface/70 p-1">
      {THEMES.map(({ value, label, icon: Icon }) => (
        <button key={value} type="button" aria-label={`Use ${value} theme`} aria-pressed={theme === value} title={`${label} theme`} onClick={() => setTheme(value)} className={cn("flex min-h-8 flex-1 items-center justify-center gap-1.5 rounded-md px-1 text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground", theme === value && "bg-card text-foreground shadow-sm")}>
          <Icon aria-hidden className="size-3.5" />{label}
        </button>
      ))}
    </div>
  );
}

function Sidebar({ pathname, me, tenant, credits, onNavigate, onHelp, onSignOut, onWorkspaceChange, switching, switchError, mobile = false }: {
  pathname: string;
  me: UseQueryResult<Identity, Error>;
  tenant: UseQueryResult<Workspace, Error>;
  credits: UseQueryResult<Credits, Error>;
  onNavigate: (href: string) => void;
  onHelp: () => void;
  onSignOut: () => void;
  onWorkspaceChange: (id: string) => void;
  switching: boolean;
  switchError: string | null;
  mobile?: boolean;
}) {
  const workspaceId = tenant.data?.id ?? me.data?.active_tenant_id ?? "";
  const membership = me.data?.tenants.find((entry) => entry.id === workspaceId);
  const workspaceName = tenant.data?.name ?? membership?.name;
  const user = me.data?.user;
  const userName = user?.name?.trim() || user?.email;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {!mobile ? (
        <Link href="/overview" onClick={() => onNavigate("/overview")} className="flex shrink-0 items-center gap-3 px-5 pb-5 pt-6">
          <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground"><Radio aria-hidden className="size-5" strokeWidth={1.8} /></span>
          <span><span className="block text-[17px] font-bold tracking-[-0.04em]">LetMeLead</span><span className="mt-0.5 block text-[9px] font-medium uppercase tracking-[0.18em] text-muted-foreground">Signal intelligence</span></span>
        </Link>
      ) : null}

      <div className={cn("mx-4 flex shrink-0 items-center gap-2.5 rounded-lg border bg-card/65 p-3", mobile && "mt-4")}>
        <span className="grid size-8 shrink-0 place-items-center rounded-md border bg-surface text-muted-foreground"><Building2 aria-hidden className="size-4" /></span>
        <div className="min-w-0 flex-1">
          <p className="mb-0.5 text-[9px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Workspace</p>
          {me.data && me.data.tenants.length > 1 ? (
            <Select aria-label="Switch workspace" value={workspaceId} disabled={switching} onChange={(event) => onWorkspaceChange(event.target.value)} className="h-6 rounded-sm border-0 bg-transparent p-0 text-xs font-semibold focus-visible:ring-offset-0">
              {!workspaceId ? <option value="" disabled>Choose workspace</option> : null}
              {me.data.tenants.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
            </Select>
          ) : workspaceName ? (
            <Link href="/settings" onClick={() => onNavigate("/settings")} className="flex items-center justify-between gap-1 text-xs font-semibold" aria-label={`Workspace settings for ${workspaceName}`}><span className="truncate">{workspaceName}</span><ChevronRight aria-hidden className="size-3.5 shrink-0 text-muted-foreground" /></Link>
          ) : tenant.isError && !me.isPending ? <p className="text-xs text-muted-foreground">Workspace unavailable</p> : <Skeleton className="mt-1 h-3 w-24" />}
        </div>
      </div>
      {switching ? <p role="status" className="px-5 pt-2 text-[11px] text-muted-foreground">Switching workspace…</p> : null}
      {switchError ? <Notice tone="error" className="mx-4 mt-2 px-3 py-2 text-xs">{switchError}</Notice> : null}

      <nav aria-label={mobile ? "Mobile navigation" : "Main navigation"} className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 pt-5">
        {NAVIGATION_GROUPS.map((group, index) => (
          <div key={group.label} className={cn(index > 0 && "mt-5")}>
            <p className="mb-2 px-3 text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/80">{group.label}</p>
            <div className="space-y-0.5">
              {group.items.map(({ href, label, icon: Icon }) => {
                const active = isNavigationActive(pathname, href);
                return (
                  <Link key={href} href={href} onClick={() => onNavigate(href)} aria-current={active ? "page" : undefined} className={cn("group flex min-h-9 items-center gap-3 rounded-lg px-3 py-2 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-accent/70 hover:text-foreground", active && "bg-signal/10 text-foreground")}>
                    <Icon aria-hidden className={cn("size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground", active && "text-signal")} strokeWidth={1.7} />
                    <span className="flex-1">{label}</span>
                    {active ? <span aria-hidden className="size-1.5 rounded-full bg-signal" /> : null}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
        <button type="button" onClick={onHelp} className="mt-3 flex min-h-9 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[12px] font-medium text-muted-foreground transition-colors hover:bg-accent/70 hover:text-foreground"><CircleHelp aria-hidden className="size-4" strokeWidth={1.7} />Help & shortcuts</button>
      </nav>

      <div className="shrink-0 space-y-3 border-t px-4 pb-4 pt-3">
        <Link href="/credits" onClick={() => onNavigate("/credits")} className="block rounded-lg border bg-surface/50 p-3 transition-colors hover:bg-accent">
          <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground"><span className="flex items-center gap-1.5"><Coins aria-hidden className="size-3.5" />Credits available</span><ArrowRight aria-hidden className="size-3.5" /></div>
          {credits.data ? <p className="mt-1.5 text-xl font-semibold leading-7 tracking-tight tabular-nums">{credits.data.balance.toLocaleString("en-US")}</p> : credits.isError ? <p className="mt-2 text-xs text-muted-foreground">Balance unavailable</p> : <Skeleton className="mt-2 h-6 w-16" />}
          {credits.data ? <p className="mt-1 text-[10px] text-muted-foreground">{credits.data.free_leads_remaining.toLocaleString("en-US")} free lead{credits.data.free_leads_remaining === 1 ? "" : "s"} remaining</p> : null}
        </Link>
        <ThemePicker />
        <div className="flex items-center gap-2">
          <Link href="/settings" onClick={() => onNavigate("/settings")} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg py-1" aria-label={userName ? `Account settings for ${userName}` : "Account settings"}>
            {userName ? <Avatar name={userName} className="size-8" /> : me.isError ? <span className="grid size-8 place-items-center rounded-full bg-muted"><UserRound aria-hidden className="size-4 text-muted-foreground" /></span> : <Skeleton className="size-8 shrink-0 rounded-full" />}
            <div className="min-w-0 flex-1">
              {userName ? <p className="truncate text-[11px] font-semibold">{userName}</p> : me.isError ? <p className="text-[11px] text-muted-foreground">Account unavailable</p> : <Skeleton className="h-3 w-20" />}
              {user ? <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{membership ? `${membership.role.replace(/_/g, " ")} · ` : ""}{user.email}</p> : null}
            </div>
          </Link>
          <Button variant="ghost" size="icon" className="size-8" onClick={onSignOut} aria-label="Sign out" title="Sign out"><LogOut aria-hidden /></Button>
        </div>
      </div>
    </div>
  );
}

type PaletteCommand = SearchableCommand & { id: string; group: string; icon: LucideIcon; run: () => void };

function CommandPalette({ open, onOpenChange, onNavigate, onHelp, onboardingComplete }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate: (href: string) => void;
  onHelp: () => void;
  onboardingComplete?: boolean;
}) {
  const id = React.useId();
  const { setTheme } = useTheme();
  const [query, setQuery] = React.useState("");
  const [selected, setSelected] = React.useState(0);
  const commands = React.useMemo<PaletteCommand[]>(() => [
    ...NAVIGATION_ITEMS.map((item) => ({ ...item, id: item.href, run: () => onNavigate(item.href) })),
    ...(onboardingComplete === false ? [{ id: "onboarding", label: "Complete workspace setup", description: "Define your company and ideal customer.", group: "Workspace", keywords: ["onboarding", "website", "icp"], icon: Sparkles, run: () => onNavigate("/onboarding") }] : []),
    ...THEMES.map(({ value, label, icon }) => ({ id: `theme-${value}`, label: `${label} theme`, description: value === "system" ? "Follow your device’s appearance." : `Use the ${value} workspace appearance.`, group: "Appearance", keywords: ["color", "mode", "display"], icon, run: () => setTheme(value) })),
    { id: "help", label: "Help & shortcuts", description: "Find your way around the workspace.", group: "Help", keywords: ["keyboard", "support", "guide"], icon: CircleHelp, run: onHelp },
  ], [onNavigate, onHelp, onboardingComplete, setTheme]);
  const filtered = filterCommands(commands, query);

  React.useEffect(() => { if (open) { setQuery(""); setSelected(0); } }, [open]);
  React.useEffect(() => {
    if (open) document.getElementById(`${id}-option-${selected}`)?.scrollIntoView?.({ block: "nearest" });
  }, [id, open, selected, filtered.length]);

  const run = (command: PaletteCommand) => {
    onOpenChange(false);
    command.run();
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Search & commands" description="Jump to a page or change your appearance." className="max-w-xl [&_[data-dialog-content]]:p-0" footer={<div className="flex w-full flex-wrap items-center gap-4 text-[10px] text-muted-foreground"><span><kbd className="rounded border bg-card px-1 py-0.5">↑ ↓</kbd> to navigate</span><span><kbd className="rounded border bg-card px-1 py-0.5">Enter</kbd> to select</span><span className="ml-auto"><kbd className="rounded border bg-card px-1 py-0.5">Esc</kbd> to close</span></div>}>
      <div className="border-b p-4">
        <div className="relative">
          <Search aria-hidden className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" />
          <Input data-autofocus role="combobox" aria-label="Search commands" aria-autocomplete="list" aria-expanded="true" aria-controls={`${id}-results`} aria-activedescendant={filtered[selected] ? `${id}-option-${selected}` : undefined} autoComplete="off" placeholder="Search pages, actions, themes…" value={query} onChange={(event) => { setQuery(event.target.value); setSelected(0); }} className="pl-10" onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setSelected((current) => moveCommandSelection(current, filtered.length, event.key === "ArrowDown" ? "next" : "previous"));
            } else if (event.key === "Home" && filtered.length) {
              event.preventDefault(); setSelected(0);
            } else if (event.key === "End" && filtered.length) {
              event.preventDefault(); setSelected(filtered.length - 1);
            } else if (event.key === "Enter" && filtered[selected]) {
              event.preventDefault(); run(filtered[selected]);
            }
          }} />
        </div>
      </div>
      <div id={`${id}-results`} role="listbox" aria-label="Commands" className="max-h-[360px] overflow-y-auto p-2">
        {filtered.map((command, index) => {
          const Icon = command.icon;
          return (
            <React.Fragment key={command.id}>
              {index === 0 || filtered[index - 1].group !== command.group ? <p aria-hidden className="px-3 pb-1.5 pt-3 text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{command.group}</p> : null}
              <button type="button" role="option" id={`${id}-option-${index}`} aria-selected={selected === index} tabIndex={-1} onMouseEnter={() => setSelected(index)} onMouseDown={(event) => event.preventDefault()} onClick={() => run(command)} className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors", selected === index ? "bg-accent" : "hover:bg-accent/60")}>
                <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-lg border bg-card text-muted-foreground"><Icon className="size-4" strokeWidth={1.7} /></span>
                <span className="min-w-0 flex-1"><span className="block text-xs font-semibold">{command.label}</span><span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{command.description}</span></span>
                {selected === index ? <ArrowRight aria-hidden className="size-3.5 text-muted-foreground" /> : null}
              </button>
            </React.Fragment>
          );
        })}
        {!filtered.length ? <p role="status" className="px-4 py-10 text-center text-sm text-muted-foreground">No commands found. Try “leads”, “billing”, or “theme”.</p> : null}
      </div>
    </Dialog>
  );
}

function HelpDialog({ open, onOpenChange, onNavigate, shortcut }: { open: boolean; onOpenChange: (open: boolean) => void; onNavigate: (href: string) => void; shortcut: string }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Help & shortcuts" description="A few useful ways to move around your workspace.">
      <div className="space-y-5">
        <div>
          <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold"><Keyboard aria-hidden className="size-4 text-signal" />Keyboard shortcuts</h3>
          <dl className="space-y-2.5 text-xs">
            {[["Open search & commands", shortcut], ["Navigate command results", "↑ / ↓"], ["Run selected command", "Enter"], ["Close a dialog", "Esc"]].map(([label, key]) => <div key={label} className="flex items-center justify-between gap-3"><dt className="text-muted-foreground">{label}</dt><dd><kbd className="rounded-md border bg-surface px-2 py-1 text-[10px]">{key}</kbd></dd></div>)}
          </dl>
        </div>
        <div className="border-t pt-4">
          <h3 className="mb-2 text-xs font-semibold">Useful places</h3>
          {[{ href: "/signals", label: "Explore buying signals", hint: "Choose the evidence worth looking for." }, { href: "/settings#agents", label: "Connect an AI agent", hint: "Find your workspace’s MCP connection details." }, { href: "/onboarding", label: "Set up your ideal customer", hint: "Define your company and who you want to reach." }, { href: "/credits", label: "Understand your credits", hint: "See your balance and billing history." }].map(({ href, label, hint }) => <Link key={href} href={href} onClick={() => onNavigate(href)} className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 hover:bg-accent"><span><span className="block text-xs font-semibold">{label}</span><span className="mt-0.5 block text-[11px] text-muted-foreground">{hint}</span></span><ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" /></Link>)}
        </div>
        <Notice>Signals explain timing—not a guarantee of purchase intent. Review the source and age before reaching out.</Notice>
      </div>
    </Dialog>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const [ready, setReady] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [helpOpen, setHelpOpen] = React.useState(false);
  const [hash, setHash] = React.useState("");
  const [shortcut, setShortcut] = React.useState("Ctrl K");

  React.useEffect(() => {
    const syncSession = () => {
      let authenticated = false;
      try { authenticated = Boolean(getSession()?.accessToken); } catch { /* Restricted storage is treated as signed out. */ }
      setReady(authenticated);
      if (!authenticated) {
        queryClient.clear();
        router.replace("/login");
      }
      return authenticated;
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== "letmelead.session" && event.key !== null) return;
      if (syncSession()) {
        // Another tab may have changed accounts or workspaces, not just tokens.
        void queryClient.cancelQueries().then(() => queryClient.resetQueries());
      }
    };
    syncSession();
    window.addEventListener("letmelead:session", syncSession);
    window.addEventListener("storage", onStorage);
    return () => { window.removeEventListener("letmelead:session", syncSession); window.removeEventListener("storage", onStorage); };
  }, [router, queryClient]);

  React.useEffect(() => {
    const syncHash = () => setHash(window.location.hash);
    syncHash();
    window.addEventListener("hashchange", syncHash);
    window.addEventListener("popstate", syncHash);
    return () => { window.removeEventListener("hashchange", syncHash); window.removeEventListener("popstate", syncHash); };
  }, [pathname]);

  React.useEffect(() => { setMobileOpen(false); setPaletteOpen(false); setHelpOpen(false); }, [pathname]);
  React.useEffect(() => {
    setShortcut(/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘ K" : "Ctrl K");
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (event.repeat) return;
        setMobileOpen(false); setHelpOpen(false); setPaletteOpen((current) => !current);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    const desktop = typeof window.matchMedia === "function" ? window.matchMedia("(min-width: 768px)") : null;
    const onDesktop = () => { if (desktop?.matches) setMobileOpen(false); };
    desktop?.addEventListener("change", onDesktop);
    return () => { document.removeEventListener("keydown", onKeyDown); desktop?.removeEventListener("change", onDesktop); };
  }, []);

  const me = useQuery({ queryKey: ["me"], queryFn: api.me, enabled: ready });
  const tenant = useQuery({ queryKey: ["tenant"], queryFn: api.tenant, enabled: ready });
  const credits = useQuery({ queryKey: ["credits"], queryFn: api.credits, enabled: ready });
  const switchWorkspace = useMutation({
    mutationFn: api.switchTenant,
    onSuccess: async (tokens, tenantId) => {
      await queryClient.cancelQueries();
      setSession({ accessToken: tokens.access_token, refreshToken: tokens.refresh_token, tenantId });
      // Reset both active and inactive data so nothing from the old tenant leaks.
      await queryClient.resetQueries();
      router.refresh();
    },
  });

  const closeForNavigation = React.useCallback((href: string) => {
    setHash(href.includes("#") ? href.slice(href.indexOf("#")) : "");
    setMobileOpen(false); setPaletteOpen(false); setHelpOpen(false);
  }, []);
  const navigate = React.useCallback((href: string) => { closeForNavigation(href); router.push(href); }, [closeForNavigation, router]);
  const openHelp = React.useCallback(() => { setMobileOpen(false); setPaletteOpen(false); setHelpOpen(true); }, []);
  const openPalette = () => { setMobileOpen(false); setHelpOpen(false); setPaletteOpen(true); };
  const signOut = () => { setMobileOpen(false); setPaletteOpen(false); setHelpOpen(false); queryClient.clear(); clearSession(); };
  const context = getNavigationContext(`${pathname}${hash}`);
  const ContextIcon = context.icon;
  const userName = me.data?.user.name?.trim() || me.data?.user.email;

  const sidebarProps = {
    pathname: `${pathname}${hash}`, me, tenant, credits,
    onNavigate: closeForNavigation, onHelp: openHelp, onSignOut: signOut,
    onWorkspaceChange: (id: string) => switchWorkspace.mutate(id),
    switching: switchWorkspace.isPending,
    switchError: switchWorkspace.error ? switchWorkspace.error.message || "Could not switch workspace. Try again." : null,
  };

  if (!ready) return <div role="status" className="grid min-h-dvh place-content-center gap-3 bg-background text-center"><Radio aria-hidden className="mx-auto size-7 text-signal" /><p className="text-xs text-muted-foreground">Opening your workspace…</p></div>;

  return (
    <div className="flex min-h-dvh bg-background">
      <a href="#main-content" className="fixed left-4 top-3 z-[60] -translate-y-20 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground focus:translate-y-0">Skip to content</a>
      <aside aria-label="Workspace sidebar" className="sticky top-0 hidden h-dvh w-[244px] shrink-0 border-r bg-sidebar md:block xl:w-[252px]"><Sidebar {...sidebarProps} /></aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex min-h-[68px] items-center justify-between gap-3 border-b bg-background/95 px-4 backdrop-blur-md sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Button variant="ghost" size="icon" className="-ml-2 md:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation menu" aria-expanded={mobileOpen} aria-haspopup="dialog"><Menu aria-hidden /></Button>
            <ContextIcon aria-hidden className="hidden size-4 shrink-0 text-muted-foreground sm:block" strokeWidth={1.7} />
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
              <span className="hidden text-muted-foreground lg:inline">{context.group}</span><ChevronRight aria-hidden className="hidden size-3 text-muted-foreground/60 lg:block" />
              {context.detail ? <><Link href={context.href} className="text-muted-foreground hover:text-foreground">{context.label}</Link><ChevronRight aria-hidden className="size-3 text-muted-foreground/60" /><span className="font-semibold">{context.detail}</span></> : <span className="font-semibold">{context.label}</span>}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
            <button type="button" onClick={openPalette} aria-label="Open command palette" aria-keyshortcuts="Control+k Meta+k" className="hidden h-9 items-center gap-2 rounded-lg border bg-card px-3 text-[11px] text-muted-foreground transition-colors hover:border-input hover:text-foreground sm:flex"><Search aria-hidden className="size-3.5" /><span>Search & commands</span><kbd className="ml-3 rounded border bg-surface px-1.5 py-0.5 text-[9px]">{shortcut}</kbd></button>
            <Button variant="ghost" size="icon" className="sm:hidden" onClick={openPalette} aria-label="Open command palette"><Search aria-hidden /></Button>
            {credits.data ? <Link href="/credits" className="hidden items-center gap-1.5 text-[11px] text-muted-foreground xl:flex"><Coins aria-hidden className="size-3.5" /><span className="font-semibold tabular-nums text-foreground">{credits.data.balance.toLocaleString("en-US")}</span> credits</Link> : null}
            <Button variant="ghost" size="icon" className="hidden size-8 lg:inline-flex" onClick={openHelp} aria-label="Open help and shortcuts" title="Help & shortcuts"><CircleHelp aria-hidden /></Button>
            {userName ? <Link href="/settings" aria-label={`Account settings for ${userName}`}><Avatar name={userName} className="size-8" /></Link> : null}
          </div>
        </header>
        <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-[1440px] min-w-0 flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8 xl:py-9">{children}</main>
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-4 text-[10px] leading-relaxed text-muted-foreground sm:px-6 lg:px-8">
          <p className="max-w-2xl">Signals show timing, not intent to buy. Every lead carries its source and age.</p>
          {credits.data ? <Badge tone="muted" className="text-[10px] tabular-nums">{credits.data.spend_report.credits_spent.toLocaleString("en-US")} credits spent</Badge> : null}
        </footer>
      </div>
      <Dialog open={mobileOpen} onOpenChange={setMobileOpen} title="LetMeLead" className="fixed inset-y-0 left-0 h-dvh max-h-dvh w-[290px] max-w-[88vw] rounded-none border-y-0 border-l-0 bg-sidebar [&_[data-dialog-content]]:flex-1 [&_[data-dialog-content]]:overflow-hidden [&_[data-dialog-content]]:p-0"><Sidebar {...sidebarProps} mobile /></Dialog>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} onNavigate={navigate} onHelp={openHelp} onboardingComplete={tenant.data?.onboarding_complete} />
      <HelpDialog open={helpOpen} onOpenChange={setHelpOpen} onNavigate={closeForNavigation} shortcut={shortcut} />
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-7 flex flex-wrap items-start justify-between gap-4 sm:mb-8", className)}>
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold leading-tight tracking-[-0.04em] sm:text-[28px]">{title}</h1>
        {description ? <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2 pt-0.5">{actions}</div> : null}
    </div>
  );
}
