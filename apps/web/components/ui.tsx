"use client";

import { AlertCircle, CheckCircle2, Inbox, Info, X, type LucideIcon } from "lucide-react";
import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/* Shared, dependency-light primitives. Keep native controls and semantic HTML. */

export const Button = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "secondary" | "outline" | "ghost" | "destructive";
  size?: "sm" | "md" | "lg" | "icon";
}>(function Button({
  className,
  variant = "default",
  size = "md",
  type = "button",
  ...props
}, ref) {
  const variants = {
    default: "border border-transparent bg-primary text-primary-foreground shadow-sm hover:bg-primary/90",
    secondary: "border border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/75",
    outline: "border border-input bg-card text-foreground shadow-sm hover:border-foreground/25 hover:bg-accent",
    ghost: "border border-transparent text-muted-foreground hover:bg-accent hover:text-foreground",
    destructive: "border border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/90",
  } as const;
  const sizes = {
    sm: "min-h-8 px-3 py-1.5 text-xs",
    md: "min-h-10 px-4 py-2 text-sm",
    lg: "min-h-11 px-5 py-2.5 text-sm",
    icon: "size-10 shrink-0 p-0",
  } as const;
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45 [&>svg]:size-4 [&>svg]:shrink-0",
        sizes[size],
        variants[variant],
        className,
      )}
      {...props}
    />
  );
});

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-xl border bg-card text-card-foreground shadow-[var(--shadow-card)]", className)} {...props} />;
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1.5 border-b p-6", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("text-sm font-semibold leading-6 tracking-tight", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm leading-relaxed text-muted-foreground", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-6", className)} {...props} />;
}

const controlClassName = "w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground transition-colors placeholder:text-muted-foreground focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-destructive";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn(controlClassName, "flex h-10 py-2", className)}
      {...props}
    />
  );
});

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(controlClassName, "flex min-h-24 py-2.5 leading-relaxed", className)}
      {...props}
    />
  );
});

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, ...props }, ref) {
  return <select ref={ref} className={cn(controlClassName, "h-10 py-2", className)} {...props} />;
});

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-xs font-semibold leading-5", className)} {...props} />;
}

export function Badge({
  className,
  tone = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  tone?: "default" | "success" | "warning" | "danger" | "muted";
}) {
  const tones = {
    default: "border-signal/15 bg-signal/10 text-signal",
    success: "border-emerald-500/15 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    warning: "border-amber-500/15 bg-amber-500/10 text-amber-700 dark:text-amber-400",
    danger: "border-destructive/15 bg-destructive/10 text-destructive",
    muted: "border-border bg-muted/70 text-muted-foreground",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px] font-medium leading-5",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn("ui-table w-full caption-bottom text-sm", className)} {...props} />
    </div>
  );
}

export function Th({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn("h-11 bg-surface/70 px-4 text-left align-middle text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground", className)}
      {...props}
    />
  );
}

export function Td({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("border-t px-4 py-4 align-top", className)} {...props} />;
}

type IconContent = React.ReactNode | LucideIcon;

function renderIcon(icon: IconContent, className: string): React.ReactNode {
  if (typeof icon === "function" || icon !== null && typeof icon === "object" && !React.isValidElement(icon) && ("render" in icon || "type" in icon)) {
    return React.createElement(icon as LucideIcon, { className, "aria-hidden": true });
  }
  return icon as React.ReactNode;
}

export function Empty({ title, hint, icon = Inbox, action, className }: {
  title: string;
  hint?: React.ReactNode;
  icon?: IconContent;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center rounded-xl border border-dashed bg-surface/35 px-6 py-12 text-center", className)}>
      {icon ? <div aria-hidden className="mb-4 grid size-12 place-items-center rounded-xl border bg-card text-muted-foreground shadow-sm [&>svg]:size-5">{renderIcon(icon, "size-5")}</div> : null}
      <p className="text-sm font-semibold tracking-tight">{title}</p>
      {hint ? <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">{hint}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function StatusDot({ ok }: { ok: boolean }) {
  return <span role="img" aria-label={ok ? "Available" : "Needs attention"} className={cn("inline-block size-2 shrink-0 rounded-full", ok ? "bg-emerald-500" : "bg-amber-500")} />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-lg bg-muted motion-reduce:animate-none", className)} />;
}

export function Notice({ children, tone = "info", className }: {
  children: React.ReactNode;
  tone?: "success" | "error" | "info";
  className?: string;
}) {
  const tones = {
    success: "border-emerald-500/20 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400",
    error: "border-destructive/20 bg-destructive/5 text-destructive",
    info: "border-signal/20 bg-signal/5 text-foreground",
  };
  const Icon = tone === "success" ? CheckCircle2 : tone === "error" ? AlertCircle : Info;
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("flex items-start gap-2.5 rounded-lg border px-4 py-3 text-sm leading-relaxed", tones[tone], className)}>
      <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", tone === "info" && "text-signal")} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  const parts = name.trim().split("@")[0].split(/[\s._-]+/).filter(Boolean);
  const initials = parts.length > 1 ? `${Array.from(parts[0])[0]}${Array.from(parts[parts.length - 1])[0]}` : Array.from(parts[0] ?? "?").slice(0, 2).join("");
  return <span role="img" aria-label={name} title={name} className={cn("inline-flex size-9 shrink-0 select-none items-center justify-center rounded-full border border-signal/20 bg-signal/10 text-[11px] font-bold text-signal", className)}>{initials.toUpperCase()}</span>;
}

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const normalized = status.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const tone = ["active", "running", "sent", "connected", "live", "completed", "claimed", "qualified", "enabled", "ready", "replied"].includes(normalized) ? "success"
    : ["failed", "error", "blocked", "bounced", "rejected"].includes(normalized) ? "danger"
    : ["paused", "pending", "queued", "warming", "warming_up", "rate_limited", "unavailable"].includes(normalized) ? "warning"
    : ["draft", "not_fit", "disabled", "disconnected", "archived", "cancelled", "canceled", "opted_out"].includes(normalized) ? "muted" : "default";
  const dots = { success: "bg-emerald-500", danger: "bg-destructive", warning: "bg-amber-500", muted: "bg-muted-foreground", default: "bg-signal" };
  return <Badge tone={tone} className={cn("capitalize", className)}><span aria-hidden className={cn("size-1.5 rounded-full", dots[tone])} />{status.replace(/[_-]/g, " ") || "Unknown"}</Badge>;
}

export function Stat({ label, value, hint, icon, className }: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: IconContent;
  className?: string;
}) {
  return (
    <Card className={cn("relative p-6", className)}>
      <dl>
        <dt className="flex items-center justify-between gap-3 text-xs font-medium text-muted-foreground">
          {label}
          {icon ? <span aria-hidden className="text-muted-foreground/80 [&>svg]:size-4">{renderIcon(icon, "size-4")}</span> : null}
        </dt>
        <dd className="mt-3 text-[28px] font-semibold leading-9 tracking-[-0.04em] tabular-nums">{value}</dd>
      </dl>
      {hint ? <p className="mt-2 text-xs leading-5 text-muted-foreground">{hint}</p> : null}
    </Card>
  );
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const inertElements = new Map<Element, { count: number; wasInert: boolean }>();
let modalCount = 0;
let previousBodyOverflow = "";

export function Dialog({ open, onOpenChange, title, description, children, footer, className }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  const id = React.useId();
  const layerRef = React.useRef<HTMLDivElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const onChangeRef = React.useRef(onOpenChange);
  onChangeRef.current = onOpenChange;
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    if (!open || !mounted) return;
    const layer = layerRef.current;
    const panel = panelRef.current;
    if (!layer || !panel) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const siblings = Array.from(document.body.children).filter((element) => element !== layer);
    for (const element of siblings) {
      const state = inertElements.get(element) ?? { count: 0, wasInert: element.hasAttribute("inert") };
      state.count += 1;
      inertElements.set(element, state);
      element.setAttribute("inert", "");
    }
    if (modalCount === 0) previousBodyOverflow = document.body.style.overflow;
    modalCount += 1;
    document.body.style.overflow = "hidden";

    const focusable = () => Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((element) => element.tabIndex >= 0 && !element.matches(":disabled") && !element.closest('[hidden], [aria-hidden="true"], [inert]'));
    const preferred = panel.querySelector<HTMLElement>("[data-autofocus], [autofocus]");
    (preferred ?? focusable()[0] ?? panel).focus();

    const onKeyDown = (event: KeyboardEvent) => {
      const layers = document.querySelectorAll("[data-dialog-layer]");
      if (layers.item(layers.length - 1) !== layer) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onChangeRef.current(false);
      } else if (event.key === "Tab") {
        const elements = focusable();
        const first = elements[0];
        const last = elements[elements.length - 1];
        if (!first) {
          event.preventDefault();
          panel.focus();
        } else if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      for (const element of siblings) {
        const state = inertElements.get(element);
        if (!state || --state.count > 0) continue;
        if (!state.wasInert) element.removeAttribute("inert");
        inertElements.delete(element);
      }
      modalCount -= 1;
      if (modalCount === 0) document.body.style.overflow = previousBodyOverflow;
      if (previousFocus?.isConnected && !previousFocus.closest("[inert]")) previousFocus.focus();
    };
  }, [open, mounted]);

  if (!open || !mounted) return null;
  return createPortal(
    <div ref={layerRef} data-dialog-layer className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm sm:p-6" onClick={(event) => { if (event.target === event.currentTarget) onOpenChange(false); }}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={description ? `${id}-description` : undefined} tabIndex={-1} className={cn("dialog-panel flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-2xl", className)}>
        <div className="flex shrink-0 items-start justify-between gap-4 border-b px-6 py-5">
          <div className="min-w-0">
            <h2 id={`${id}-title`} className="text-base font-semibold tracking-tight">{title}</h2>
            {description ? <p id={`${id}-description`} className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{description}</p> : null}
          </div>
          <Button variant="ghost" size="icon" className="-mr-2 -mt-1 size-8" onClick={() => onOpenChange(false)} aria-label="Close dialog"><X aria-hidden /></Button>
        </div>
        <div data-dialog-content className="min-h-0 overflow-y-auto px-6 py-5">{children}</div>
        {footer ? <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t bg-surface/50 px-6 py-4">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
