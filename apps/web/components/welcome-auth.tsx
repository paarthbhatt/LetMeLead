"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ArrowUpRight, Eye, EyeOff, Fingerprint, Radio, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useState, type InputHTMLAttributes, type ReactNode } from "react";

import { api, API_URL } from "@/lib/api";
import { Button, Input } from "@/components/ui";

export function WelcomeAuthFrame({ mode, title, description, children }: {
  mode: "login" | "signup";
  title: string;
  description: string;
  children: ReactNode;
}) {
  const signup = mode === "signup";
  const brand = (
    <Link href="/" className="inline-flex items-center gap-2.5 text-lg font-bold tracking-tight" aria-label="LetMeLead home">
      <span className="grid size-9 place-items-center rounded-xl bg-foreground text-background"><ArrowUpRight className="size-5" aria-hidden /></span>
      LetMeLead<span className="text-muted-foreground">.</span>
    </Link>
  );
  return (
    <main className="grid min-h-screen bg-background font-sans text-foreground lg:grid-cols-[minmax(340px,0.85fr)_minmax(480px,1.15fr)]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-[#191b20] p-10 text-white lg:flex xl:p-14">
        <Link href="/" className="inline-flex w-fit items-center gap-2.5 text-lg font-bold tracking-tight" aria-label="LetMeLead home">
          <span className="grid size-9 place-items-center rounded-xl border border-white/20"><ArrowUpRight className="size-5" aria-hidden /></span>
          LetMeLead<span className="text-white/50">.</span>
        </Link>
        <div className="my-16 max-w-md">
          <p className="mb-5 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/50">Evidence first. Always.</p>
          <h2 className="text-4xl font-semibold leading-[1.15] tracking-tight xl:text-5xl">Better timing.<br /><span className="text-white/50">Better conversations.</span></h2>
          <p className="mt-6 max-w-sm text-sm leading-7 text-white/65">Find a reason to reach out, understand the evidence, and decide who is worth your time.</p>
          <div className="mt-10 space-y-5 border-t border-white/10 pt-7">
            {[
              { icon: Radio, title: "Real signals", hint: "News, hiring, and public buying moments." },
              { icon: Fingerprint, title: "The evidence attached", hint: "A source and a date, not a black-box promise." },
              { icon: ShieldCheck, title: "You stay in control", hint: "Review fit and messages before reaching out." },
            ].map(({ icon: Icon, title: label, hint }) => (
              <div key={label} className="flex gap-3.5">
                <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/5"><Icon className="size-4 text-white/75" aria-hidden /></span>
                <div><p className="text-sm font-medium">{label}</p><p className="mt-1 text-xs leading-5 text-white/50">{hint}</p></div>
              </div>
            ))}
          </div>
        </div>
        <p className="text-xs leading-5 text-white/40">Signals indicate timing. They are not a promise of purchase intent.</p>
      </aside>
      <section className="flex min-w-0 flex-col px-6 py-7 sm:px-10 lg:px-14 xl:px-20" aria-labelledby="welcome-title">
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div className="lg:hidden">{brand}</div>
          <p className="ml-auto text-xs text-muted-foreground">
            {signup ? "Already have a workspace?" : "New to LetMeLead?"}{" "}
            <Link href={signup ? "/login" : "/signup"} className="ml-1 inline-flex items-center gap-1 font-semibold text-foreground underline-offset-4 hover:underline">{signup ? "Sign in" : "Create an account"}<ArrowRight className="size-3" aria-hidden /></Link>
          </p>
        </div>
        <div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center py-12 lg:py-16">
          <h1 id="welcome-title" className="text-3xl font-semibold leading-tight tracking-tight sm:text-[34px]">{title}</h1>
          <p className="mb-8 mt-3 text-sm leading-6 text-muted-foreground">{description}</p>
          {children}
        </div>
      </section>
    </main>
  );
}

export function WelcomePasswordInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={visible ? "text" : "password"} className="h-11 pr-11" />
      <button type="button" disabled={props.disabled} onClick={() => setVisible((current) => !current)} aria-label={visible ? "Hide password" : "Show password"} aria-pressed={visible} className="absolute right-1.5 top-1.5 grid size-8 place-items-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50">
        {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
      </button>
    </div>
  );
}

export function WelcomeGoogleSignIn({ disabled = false }: { disabled?: boolean }) {
  const health = useQuery({ queryKey: ["health"], queryFn: api.health, staleTime: 60_000, retry: 1 });
  const unavailable = health.data?.providers.google_oauth === false;
  const checking = health.isLoading;
  const icon = <span className="text-base font-bold" aria-hidden>G</span>;
  const style = "flex h-11 w-full items-center justify-center gap-3 rounded-xl border bg-card text-sm font-semibold transition hover:bg-muted";
  return (
    <div className="space-y-2">
      {disabled || checking || unavailable ? (
        <Button type="button" variant="outline" className={style} disabled>{icon}{checking ? "Checking Google sign-in…" : "Continue with Google"}</Button>
      ) : (
        <a href={`${API_URL}/v1/auth/google`} className={style}>{icon}Continue with Google</a>
      )}
      {unavailable ? <p className="text-center text-xs leading-5 text-muted-foreground">Google sign-in is not configured. Use email and password instead.</p> : null}
    </div>
  );
}

export function WelcomeAuthDivider() {
  return <div className="my-6 flex items-center gap-4" aria-hidden><div className="h-px flex-1 bg-border" /><span className="text-[11px] text-muted-foreground">or continue with email</span><div className="h-px flex-1 bg-border" /></div>;
}
