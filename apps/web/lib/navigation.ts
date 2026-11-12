import {
  BarChart3,
  Bot,
  CreditCard,
  Inbox,
  LayoutList,
  LayoutDashboard,
  Linkedin,
  Radio,
  Send,
  Settings,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

export type SearchableCommand = {
  label: string;
  description?: string;
  keywords?: readonly string[];
  group?: string;
};

export type NavigationItem = SearchableCommand & {
  href: string;
  description: string;
  group: string;
  icon: LucideIcon;
};

export const NAVIGATION_GROUPS: { label: string; items: NavigationItem[] }[] = [
  {
    label: "Workspace",
    items: [
      { href: "/overview", label: "Overview", description: "Your pipeline, at a glance.", group: "Workspace", icon: LayoutDashboard, keywords: ["dashboard", "home", "metrics", "activity"] },
      { href: "/signals", label: "Signals", description: "Find the right reason to reach out.", group: "Workspace", icon: Radio, keywords: ["buying signals", "intent", "sources", "feeds", "scan"] },
      { href: "/leads", label: "Leads", description: "Your next conversation starts here.", group: "Workspace", icon: LayoutList, keywords: ["companies", "prospects", "targets", "evidence", "pipeline"] },
    ],
  },
  {
    label: "Outreach",
    items: [
      { href: "/campaigns", label: "Campaigns", description: "Thoughtful outreach, at the right pace.", group: "Outreach", icon: Send, keywords: ["outreach", "sequences", "messages", "send"] },
      { href: "/replies", label: "Replies", description: "Keep good conversations moving.", group: "Outreach", icon: Inbox, keywords: ["inbox", "conversations", "responses", "unread"] },
    ],
  },
  {
    label: "Manage",
    items: [
      { href: "/linkedin", label: "LinkedIn", description: "Your connection and sending safeguards.", group: "Manage", icon: Linkedin, keywords: ["account", "connection", "integration", "limits"] },
      { href: "/credits", label: "Credits", description: "A clear view of your credit balance.", group: "Manage", icon: CreditCard, keywords: ["billing", "balance", "top up", "invoices", "payments"] },
      { href: "/settings#agents", label: "Agents", description: "Connect your AI tools to the workspace.", group: "Manage", icon: Bot, keywords: ["mcp", "claude", "codex", "cursor", "automation"] },
      { href: "/audit", label: "Audit log", description: "Every workspace action, accounted for.", group: "Manage", icon: BarChart3, keywords: ["activity", "history", "events", "logs"] },
      { href: "/settings", label: "Settings", description: "Make this workspace yours.", group: "Manage", icon: Settings, keywords: ["team", "members", "profile", "api keys", "webhooks"] },
    ],
  },
];

export const NAVIGATION_ITEMS = NAVIGATION_GROUPS.flatMap((group) => group.items);

function cleanPath(pathname: string): string {
  return pathname.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
}

export function isNavigationActive(pathname: string, href: string): boolean {
  const path = cleanPath(pathname);
  const target = cleanPath(href);
  const hash = pathname.includes("#") ? pathname.slice(pathname.indexOf("#")) : "";
  const targetHash = href.includes("#") ? href.slice(href.indexOf("#")) : "";
  if (targetHash) return path === target && hash === targetHash;
  // A known section anchor (Agents) takes precedence over its parent page.
  if (hash && NAVIGATION_ITEMS.some((item) => item.href === `${path}${hash}`)) return false;
  return path === target || (target !== "/" && path.startsWith(`${target}/`));
}

export function getNavigationContext(pathname: string): NavigationItem & { detail?: string } {
  const item = NAVIGATION_ITEMS.find((entry) => isNavigationActive(pathname, entry.href));
  if (item) {
    const nested = cleanPath(pathname) !== item.href;
    const detail = nested && item.href === "/leads" ? "Lead details" : nested && item.href === "/campaigns" ? "Campaign details" : undefined;
    return { ...item, detail };
  }
  return {
    href: "/onboarding",
    label: pathname.startsWith("/onboarding") ? "Workspace setup" : "Workspace",
    description: "Build a pipeline around your ideal customers.",
    group: "Workspace",
    icon: Sparkles,
  };
}

function normalizeSearch(value: string): string {
  return value.normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

export function filterCommands<T extends SearchableCommand>(commands: readonly T[], query: string): T[] {
  const words = normalizeSearch(query).trim().split(/\s+/).filter(Boolean);
  return commands.filter((command) => {
    const text = normalizeSearch([command.label, command.description, command.group, ...(command.keywords ?? [])].filter(Boolean).join(" "));
    return words.every((word) => text.includes(word));
  });
}

export function moveCommandSelection(current: number, count: number, direction: "next" | "previous"): number {
  if (count <= 0) return 0;
  const step = direction === "next" ? 1 : -1;
  return (((current + step) % count) + count) % count;
}
