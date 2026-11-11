"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { api, ApiError } from "@/lib/api";
import { saveTokens } from "@/lib/auth";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label } from "@/components/ui";

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", company_name: "", email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function update(key: keyof typeof form) {
    return (event: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: event.target.value });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const tokens = await api.signup(form);
      saveTokens(tokens);
      router.push("/onboarding");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create the workspace.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Create your workspace</CardTitle>
          <CardDescription>10 leads are free. No card, no subscription.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="name">Your name</Label>
                <Input id="name" value={form.name} onChange={update("name")} autoComplete="name" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="company">Company</Label>
                <Input id="company" value={form.company_name} onChange={update("company_name")} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Work email</Label>
              <Input id="email" type="email" required value={form.email} onChange={update("email")} autoComplete="email" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password (10+ characters)</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={10}
                value={form.password}
                onChange={update("password")}
                autoComplete="new-password"
              />
            </div>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Creating…" : "Create workspace"}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Already have one?{" "}
            <Link href="/login" className="text-foreground underline-offset-4 hover:underline">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
