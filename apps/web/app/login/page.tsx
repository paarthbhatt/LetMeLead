"use client";

import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Loader2 } from "lucide-react";
import { useState } from "react";

import { api } from "@/lib/api";
import { saveTokens } from "@/lib/auth";
import { Button, Input, Label, Notice } from "@/components/ui";
import { WelcomeAuthDivider, WelcomeAuthFrame, WelcomeGoogleSignIn, WelcomePasswordInput } from "@/components/welcome-auth";
import { welcomeError } from "@/components/welcome-data";

export default function LoginPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const tokens = await api.login({ email: email.trim(), password });
      saveTokens(tokens);
      queryClient.clear();
      router.replace("/overview");
    } catch (err) {
      setError(welcomeError(err, "Could not sign in. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <WelcomeAuthFrame mode="login" title="Welcome back." description="Pick up your pipeline, review fresh signals, and keep the right conversations moving.">
      <WelcomeGoogleSignIn disabled={busy} />
      <WelcomeAuthDivider />
      <form onSubmit={submit} className="space-y-5" aria-busy={busy} aria-describedby={error ? "login-error" : undefined}>
        <fieldset disabled={busy} className="space-y-5">
          <div className="space-y-2"><Label htmlFor="email">Email address</Label><Input id="email" type="email" autoComplete="email" placeholder="you@company.com" required value={email} onChange={(event) => setEmail(event.target.value)} className="h-11" /></div>
          <div className="space-y-2"><Label htmlFor="password">Password</Label><WelcomePasswordInput id="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} disabled={busy} /></div>
        </fieldset>
        {error ? <div id="login-error"><Notice tone="error" className="rounded-xl text-xs leading-5">{error}</Notice></div> : null}
        <Button type="submit" className="h-11 w-full rounded-xl" disabled={busy}>{busy ? <><Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />Signing in…</> : <>Sign in<ArrowRight className="size-4" aria-hidden /></>}</Button>
      </form>
    </WelcomeAuthFrame>
  );
}
