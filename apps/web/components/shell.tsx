"use client";

import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  CreditCard,
  Inbox,
  LayoutList,
  Linkedin,
  LogOut,
  Moon,
  Radio,
  Send,
  Settings,
  Sparkles,
  Sun,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { api } from "@/lib/api";
import { clearSession, getSession } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { toggleTheme } from "./providers";
import { Badge, Button } from "./ui";

const NAV = [
  { href: "/signals", label: "Signals", icon: Radio },
  { href: "/leads", label: "Leads", icon: LayoutList },
  { href: "/campaigns", label: "Campaigns", icon: Send },
  { href: "/replies", label: "Replies", icon: Inbox },
  { href: "/linkedin", label: "LinkedIn", icon: Linkedin },
  { href: "/credits", label: "Credits", icon: CreditCard },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/audit", label: "Audit log", icon: BarChart3 },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!getSession()?.accessToken) {
      router.replace("/login");
      return;
    }
    setReady(true);
  }, [pathname, router]);

  const tenant = useQuery({ queryKey: ["tenant"], queryFn: api.tenant, enabled: ready });
  const credits = useQuery({ queryKey: ["credits"], queryFn: api.credits, enabled: ready });

  if (!ready) return <div className="min-h-screen bg-background" />;

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-60 flex-col border-r bg-card/40 p-4 md:flex">
        <Link href="/leads" className="mb-6 flex items-center gap-2 px-2 font-semibold">
          <Sparkles className="size-5 text-primary" aria-hidden />
          LetMeLead
        </Link>
        <nav className="flex flex-1 flex-col gap-1" aria-label="Main">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground",
                  active && "bg-accent text-foreground",
                )}
              >
                <Icon className="size-4" aria-hidden />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-4 space-y-2 border-t pt-4 text-xs text-muted-foreground">
          <p className="truncate font-medium text-foreground">{tenant.data?.name ?? "—"}</p>
          <p>
            Credits: <span className="font-medium text-foreground">{credits.data?.balance ?? 0}</span>
            {credits.data ? ` · ${credits.data.free_leads_remaining} free left` : null}
          </p>
          <div className="flex items-center gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={toggleTheme} aria-label="Toggle theme">
              <Sun className="size-3.5 dark:hidden" aria-hidden />
              <Moon className="hidden size-3.5 dark:block" aria-hidden />
              Theme
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                clearSession();
                router.push("/login");
              }}
            >
              <LogOut className="size-3.5" aria-hidden />
              Sign out
            </Button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b px-4 py-3 md:hidden">
          <Link href="/leads" className="font-semibold">
            LetMeLead
          </Link>
          <div className="flex items-center gap-2 overflow-x-auto">
            {NAV.slice(0, 4).map(({ href, label }) => (
              <Link key={href} href={href} className="whitespace-nowrap text-sm text-muted-foreground">
                {label}
              </Link>
            ))}
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 p-4 md:p-8">{children}</main>

        <footer className="border-t px-4 py-3 text-xs text-muted-foreground md:px-8">
          Signals show timing, not intent to buy. Every lead carries its source and age.
          {credits.data ? (
            <Badge tone="muted" className="ml-2">
              {credits.data.spend_report.credits_spent} credits spent
            </Badge>
          ) : null}
        </footer>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions}
    </div>
  );
}
