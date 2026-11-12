"use client";

import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import { useState } from "react";

import { api } from "@/lib/api";
import { saveTokens } from "@/lib/auth";
import { Button, Input, Label, Notice } from "@/components/ui";
import { WelcomeAuthDivider, WelcomeAuthFrame, WelcomeGoogleSignIn, WelcomePasswordInput } from "@/components/welcome-auth";
import { welcomeError } from "@/components/welcome-data";

export default function SignupPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: "", company_name: "", email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function update(key: keyof typeof form) {
    return (event: React.ChangeEvent<HTMLInputElement>) => setForm((current) => ({ ...current, [key]: event.target.value }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const tokens = await api.signup({ ...form, name: form.name.trim(), company_name: form.company_name.trim(), email: form.email.trim() });
      saveTokens(tokens);
      queryClient.clear();
      router.replace("/onboarding");
    } catch (err) {
      setError(welcomeError(err, "Could not create the workspace. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <WelcomeAuthFrame mode="signup" title="Make your next lead count." description="Create a workspace for your team. Start with free leads, then claim more when the fit is right.">
      <div className="mb-6 flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-muted-foreground"><span className="inline-flex items-center gap-1.5"><Check className="size-3.5" aria-hidden />No card required</span><span className="inline-flex items-center gap-1.5"><Check className="size-3.5" aria-hidden />No subscription</span></div>
      <WelcomeGoogleSignIn disabled={busy} />
      <WelcomeAuthDivider />
      <form onSubmit={submit} className="space-y-5" aria-busy={busy} aria-describedby={error ? "signup-error" : undefined}>
        <fieldset disabled={busy} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="name">Your name <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="name" value={form.name} onChange={update("name")} autoComplete="name" placeholder="Alex Morgan" maxLength={120} className="h-11" /></div><div className="space-y-2"><Label htmlFor="company">Company <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="company" value={form.company_name} onChange={update("company_name")} autoComplete="organization" placeholder="Your company" maxLength={160} className="h-11" /></div></div>
          <div className="space-y-2"><Label htmlFor="email">Work email</Label><Input id="email" type="email" required value={form.email} onChange={update("email")} autoComplete="email" placeholder="you@company.com" className="h-11" /></div>
          <div className="space-y-2"><Label htmlFor="password">Password</Label><WelcomePasswordInput id="password" required minLength={10} value={form.password} onChange={update("password")} autoComplete="new-password" aria-describedby="password-hint" disabled={busy} /><p id="password-hint" className="text-[11px] leading-5 text-muted-foreground">Use at least 10 characters. A long, unique passphrase works well.</p></div>
        </fieldset>
        {error ? <div id="signup-error"><Notice tone="error" className="rounded-xl text-xs leading-5">{error}</Notice></div> : null}
        <Button type="submit" className="h-11 w-full rounded-xl" disabled={busy}>{busy ? <><Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />Creating workspace…</> : <>Create workspace<ArrowRight className="size-4" aria-hidden /></>}</Button>
      </form>
      <p className="mt-5 text-center text-[11px] leading-5 text-muted-foreground">Next, add your offer and ideal buyers. You can fine-tune everything later.</p>
    </WelcomeAuthFrame>
  );
}
