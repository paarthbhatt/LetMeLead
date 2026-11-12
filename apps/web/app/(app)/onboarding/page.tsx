"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, Circle, Globe, Loader2, Radio, ShieldCheck, Target, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { PageHeader } from "@/components/shell";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Textarea,
} from "@/components/ui";
import { welcomeBriefFields, welcomeError, welcomeList, welcomeSaveThenScan, welcomeSetupPayload, welcomeTargets, welcomeWebsite, type WelcomeBuyerForm, type WelcomeSetupPayload } from "@/components/welcome-data";
import { WelcomeLink } from "@/components/welcome-overview";
import { api } from "@/lib/api";

export default function OnboardingPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const tenant = useQuery({ queryKey: ["tenant"], queryFn: api.tenant });
  const sources = useQuery({ queryKey: ["sources"], queryFn: api.sources });
  const savedTargets = useQuery({ queryKey: ["targets", "welcome"], queryFn: () => api.targets() });
  const [form, setForm] = useState<WelcomeBuyerForm>({ website: "", offer: "", buyers: "", roles: "", targets: "" });
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState<{ text: string; warning?: boolean } | null>(null);
  const [phase, setPhase] = useState<"saving" | "scanning" | null>(null);
  const hydrated = useRef(false);

  useEffect(() => {
    if (!tenant.data || hydrated.current) return;
    hydrated.current = true;
    const fields = welcomeBriefFields(tenant.data.icp);
    setForm((current) => ({ ...current, website: tenant.data.website || "", ...fields }));
  }, [tenant.data]);

  const build = useMutation({
    mutationFn: async () => {
      const website = welcomeWebsite(form.website);
      if (!website.url) throw new Error(website.error || "Add your website first.");
      return api.onboarding({
        website: website.url,
        offer: form.offer.trim() || undefined,
        buyers: form.buyers.trim() ? welcomeList(form.buyers) : undefined,
        roles: form.roles.trim() ? welcomeList(form.roles) : undefined,
        targets: [],
        discover: false,
      });
    },
    onMutate: () => { setErrors([]); setNotice(null); },
    onSuccess: async (result) => {
      const fields = welcomeBriefFields(result.icp);
      setForm((current) => ({ ...current, offer: current.offer || fields.offer, buyers: current.buyers || fields.buyers, roles: current.roles || fields.roles }));
      setNotice({ text: "Website and brief saved. Review the offer and buyer fields below before continuing." });
      await queryClient.invalidateQueries({ queryKey: ["tenant"] });
    },
    onError: (err) => setErrors([welcomeError(err, "Could not read the website. You can write the buyer brief manually instead.")]),
  });

  const finish = useMutation({
    mutationFn: ({ payload, scanAfterSave }: { payload: WelcomeSetupPayload; scanAfterSave: boolean }) => welcomeSaveThenScan({
      payload,
      scanAfterSave,
      save: api.onboarding,
      scan: () => { setPhase("scanning"); return api.scan({ wait: false }); },
    }),
    onMutate: () => { setErrors([]); setNotice(null); setPhase("saving"); },
    onSuccess: async (result, variables) => {
      await Promise.all(["tenant", "targets", "leads", "sources", "stats"].map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
      if ("scanError" in result) {
        setNotice({ warning: true, text: `Your buyer brief and target list are saved, but the scan could not start. ${welcomeError(result.scanError, "Try again from Overview.")}` });
      } else if (variables.scanAfterSave) {
        setNotice({ text: "Setup saved and scan requested. Scans run in the background and may return no leads. Open Overview and refresh to check the results." });
      } else {
        router.replace("/overview");
      }
    },
    onError: (err) => setErrors([welcomeError(err, "Could not save your setup. Nothing was scanned; please try again.")]),
    onSettled: () => setPhase(null),
  });

  const busy = build.isPending || finish.isPending;
  const blocked = tenant.isLoading || tenant.isError;
  const parsedTargets = welcomeTargets(form.targets);
  const enabledSources = sources.data?.filter((source) => source.enabled).length ?? 0;
  const canScan = !sources.isError && !sources.isLoading && enabledSources > 0;

  function update(key: keyof WelcomeBuyerForm) {
    return (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm((current) => ({ ...current, [key]: event.target.value }));
      setErrors([]);
      setNotice(null);
    };
  }

  function save(scanAfterSave: boolean) {
    if (busy || blocked) return;
    const result = welcomeSetupPayload(form);
    if (!result.payload) { setErrors(result.errors); setNotice(null); return; }
    finish.mutate({ payload: result.payload, scanAfterSave });
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Set up your buyers" description="Give every signal the context it needs. Start with your offer, the people you sell to, and companies to watch." actions={<WelcomeLink href="/overview" variant="text">{tenant.data?.onboarding_complete ? "Back to overview" : "Skip for now"}<ArrowRight className="size-3.5" aria-hidden /></WelcomeLink>} />
      {tenant.isLoading ? <p role="status" className="text-xs text-muted-foreground">Loading your saved buyer brief…</p> : null}
      {tenant.isError ? <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-4"><p className="flex-1 text-xs leading-6">Could not load your saved brief. Retry before editing so existing settings are not overwritten.</p><Button type="button" variant="outline" size="sm" onClick={() => { void tenant.refetch(); }}>Try again</Button></div> : null}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
        <form onSubmit={(event) => { event.preventDefault(); save(false); }} className="min-w-0 space-y-5" aria-busy={busy} aria-describedby={errors.length ? "setup-errors" : undefined} noValidate>
          <fieldset disabled={busy || blocked} className="space-y-5">
            <Card className="rounded-xl shadow-none"><CardHeader><div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground"><Globe className="size-3.5" aria-hidden />01 · Your company</div><CardTitle>A clear offer is a good start.</CardTitle><CardDescription className="text-xs leading-6">Build a brief from your public website, or fill in the offer manually below.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="space-y-2"><Label htmlFor="website">Company website <span className="font-normal text-muted-foreground">(optional)</span></Label><div className="flex flex-wrap gap-2"><Input id="website" inputMode="url" autoComplete="url" placeholder="https://your-company.com" value={form.website} onChange={update("website")} aria-describedby="website-hint" className="h-11 min-w-0 flex-1 basis-64" /><Button type="button" variant="outline" className="h-11" disabled={busy || !form.website.trim() || blocked} onClick={() => build.mutate()}>{build.isPending ? <><Loader2 className="size-4 animate-spin" aria-hidden />Reading website…</> : <>Build brief<ArrowRight className="size-4" aria-hidden /></>}</Button></div><p id="website-hint" className="text-[11px] leading-6 text-muted-foreground">This saves your website and fills empty brief fields. If a site is blocked or too thin, write the brief manually; we do not invent the missing content.</p></div><div className="space-y-2"><Label htmlFor="offer">What do you sell?</Label><Textarea id="offer" placeholder="We help B2B sales teams turn public buying signals into relevant conversations." value={form.offer} onChange={update("offer")} className="min-h-[100px]" aria-describedby="offer-hint" /><p id="offer-hint" className="text-[11px] leading-5 text-muted-foreground">One or two sentences: your product, the problem it solves, and who benefits.</p></div></CardContent></Card>

            <Card className="rounded-xl shadow-none"><CardHeader><div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground"><Users className="size-3.5" aria-hidden />02 · Your ideal buyers</div><CardTitle>Who is the right person?</CardTitle><CardDescription className="text-xs leading-6">Buyer personas qualify the lead. Hiring keywords help spot relevant job signals.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="space-y-2"><Label htmlFor="buyers">Buyer personas</Label><Input id="buyers" value={form.buyers} onChange={update("buyers")} placeholder="VP Sales, Head of Revenue, Founder" className="h-11" aria-describedby="buyers-hint" /><p id="buyers-hint" className="text-[11px] leading-5 text-muted-foreground">Separate roles with commas. Be specific about who owns the problem you solve.</p></div><div className="space-y-2"><Label htmlFor="roles">Hiring keywords <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="roles" value={form.roles} onChange={update("roles")} placeholder="sales development, revenue operations" className="h-11" aria-describedby="roles-hint" /><p id="roles-hint" className="text-[11px] leading-5 text-muted-foreground">Comma-separated role keywords to watch in job postings.</p></div></CardContent></Card>

            <Card className="rounded-xl shadow-none"><CardHeader><div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground"><Target className="size-3.5" aria-hidden />03 · Target companies</div><CardTitle>A watchlist, not a wish list.</CardTitle><CardDescription className="text-xs leading-6">Add companies to scan for news, jobs, and public discussions. You can add more from Leads later.</CardDescription></CardHeader><CardContent className="space-y-3"><Label htmlFor="targets">Companies to add <span className="font-normal text-muted-foreground">(optional)</span></Label><Textarea id="targets" value={form.targets} onChange={update("targets")} className="min-h-[130px] font-mono text-xs leading-6" placeholder={"Acme AI,acme.ai,US\nVector Labs,vectorlabs.io,GB"} aria-describedby="targets-hint" /><p id="targets-hint" className="text-[11px] leading-6 text-muted-foreground">One per line: <code className="rounded bg-muted px-1 py-0.5">company,domain,country</code>. Country is optional; use a two-letter code. Quote company names containing commas.</p>{form.targets.trim() ? <p className="text-[11px] leading-6 text-muted-foreground">{parsedTargets.errors.length ? `${parsedTargets.errors.length} ${parsedTargets.errors.length === 1 ? "line needs" : "lines need"} review. Invalid lines will not be silently skipped.` : `${parsedTargets.targets.length} ${parsedTargets.targets.length === 1 ? "company" : "companies"} ready to add.${parsedTargets.duplicates ? ` ${parsedTargets.duplicates} duplicate ${parsedTargets.duplicates === 1 ? "domain" : "domains"} will be added only once.` : ""}`}</p> : null}{savedTargets.data?.items.length ? <p className="rounded-lg bg-muted/40 px-3 py-2 text-[11px] leading-6 text-muted-foreground">{savedTargets.data.next_cursor ? `Showing ${savedTargets.data.items.length} existing companies; more are available in Leads.` : `${savedTargets.data.items.length} ${savedTargets.data.items.length === 1 ? "company is" : "companies are"} already saved in your watchlist.`} Adding companies here does not replace the existing list.</p> : null}</CardContent></Card>
          </fieldset>

          {errors.length ? <div id="setup-errors" role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-xs leading-6 text-destructive"><p className="mb-1 font-semibold">Please check your setup.</p><ul className="list-inside list-disc">{errors.map((error, index) => <li key={index}>{error}</li>)}</ul></div> : null}
          {notice ? <div role={notice.warning ? "alert" : "status"} className="space-y-3 rounded-xl border bg-muted/40 p-4"><p className="text-xs leading-6">{notice.text}</p><WelcomeLink href="/overview">Go to overview<ArrowRight className="size-4" aria-hidden /></WelcomeLink></div> : null}
          <div className="flex flex-wrap items-center gap-3"><Button type="submit" className="h-11" disabled={busy || blocked}>{finish.isPending ? <><Loader2 className="size-4 animate-spin" aria-hidden />{phase === "scanning" ? "Requesting scan…" : "Saving setup…"}</> : <>Save and continue<ArrowRight className="size-4" aria-hidden /></>}</Button><Button type="button" variant="outline" className="h-11" disabled={busy || blocked || !canScan} onClick={() => save(true)}><Radio className="size-4" aria-hidden />Save and run scan</Button></div>
          <p className="text-[11px] leading-6 text-muted-foreground">{sources.isError ? "Source availability could not be loaded. You can save your brief, then check Signals before scanning." : !sources.isLoading && !enabledSources ? "No sources are enabled yet. Save your brief, then turn on sources in Signals before scanning." : "Your brief and targets are saved before a scan starts. Scans read enabled sources; they do not send outreach."}</p>
        </form>

        <aside className="space-y-5 xl:sticky xl:top-6" aria-label="Buyer setup guide"><Card className="rounded-xl bg-muted/30 p-5 shadow-none"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">A useful starting point</p><h2 className="mt-3 text-lg font-semibold leading-7 tracking-tight">Give the signal<br />a reason to matter.</h2><p className="mt-3 text-xs leading-6 text-muted-foreground">A hiring announcement only becomes relevant when it matches what you sell and who you sell to.</p><ul className="mt-6 space-y-4">{[{ title: "Your offer", hint: "The problem you solve", ready: Boolean(form.offer.trim()) }, { title: "Your buyers", hint: "The people who own that problem", ready: welcomeList(form.buyers).length > 0 }, { title: "Your watchlist", hint: "Companies you want to understand", ready: parsedTargets.targets.length > 0 || Boolean(savedTargets.data?.items.length) }].map((item) => <li key={item.title} className="flex gap-2.5">{item.ready ? <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden /> : <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground/50" aria-hidden />}<div><p className="text-xs font-semibold">{item.title}</p><p className="mt-1 text-[11px] leading-5 text-muted-foreground">{item.hint}</p></div></li>)}</ul></Card><div className="flex gap-2.5 px-1"><ShieldCheck className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden /><p className="text-[11px] leading-6 text-muted-foreground">Nothing is sent during setup. Evidence shows timing, not a guarantee that a company wants to buy.</p></div><WelcomeLink href="/signals" variant="text" className="px-1">Review your signal sources<ArrowRight className="size-3.5" aria-hidden /></WelcomeLink></aside>
      </div>
    </div>
  );
}
