"use client";

import { Bot, Building2, Check, Copy, Users, Webhook } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Notice } from "@/components/ui";
import { settingsSectionFromHash, type SettingsSection } from "@/lib/account-helpers";
import { cn } from "@/lib/utils";

export function AccountPanel({
  title,
  description,
  icon,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("overflow-hidden rounded-xl shadow-none", className)}>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          {icon ? (
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-signal/10 text-signal">
              {icon}
            </span>
          ) : null}
          <div className="min-w-0 space-y-1">
            <CardTitle className="text-sm">{title}</CardTitle>
            {description ? <CardDescription className="max-w-xl text-xs leading-relaxed">{description}</CardDescription> : null}
          </div>
        </div>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function AccountCopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "error">("idle");

  useEffect(() => {
    if (state === "idle") return;
    const timer = window.setTimeout(() => setState("idle"), 2500);
    return () => window.clearTimeout(timer);
  }, [state]);

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        aria-label={label}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setState("copied");
          } catch {
            setState("error");
          }
        }}
      >
        {state === "copied" ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        <span aria-live="polite">{state === "copied" ? "Copied" : label}</span>
      </Button>
      {state === "error" ? <span role="alert" className="max-w-48 text-right text-xs text-destructive">Copy blocked. Select and copy manually.</span> : null}
    </div>
  );
}

const SECTION_LINKS = [
  { id: "workspace", label: "Workspace", icon: Building2 },
  { id: "team", label: "Team", icon: Users },
  { id: "agents", label: "Agents & API", icon: Bot },
  { id: "webhooks", label: "Webhooks", icon: Webhook },
] as const;

export function useSettingsSection() {
  const [section, setSection] = useState<SettingsSection>("workspace");
  useEffect(() => {
    const sync = () => setSection(settingsSectionFromHash(window.location.hash));
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  return { section, setSection };
}

export function AccountSettingsNav({ section, onChange }: {
  section: SettingsSection;
  onChange: (section: SettingsSection) => void;
}) {
  return (
    <nav aria-label="Settings sections" className="flex gap-1 overflow-x-auto border-b">
      {SECTION_LINKS.map(({ id, label, icon: Icon }) => (
        <a
          key={id}
          href={`#${id}`}
          aria-current={section === id ? "page" : undefined}
          onClick={() => onChange(id)}
          className={cn(
            "flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            section === id ? "border-signal text-signal" : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon className="size-4" />{label}
        </a>
      ))}
    </nav>
  );
}

export function AccountQueryError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Notice tone="error">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p>{message}</p>
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>Try again</Button>
      </div>
    </Notice>
  );
}

export function AccountDetail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 border-b py-3 last:border-0 sm:grid-cols-[140px_1fr] sm:gap-4">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-sm">{children}</dd>
    </div>
  );
}
