// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import OverviewPage from "@/app/(app)/overview/page";
import OnboardingPage from "@/app/(app)/onboarding/page";
import LoginPage from "@/app/login/page";
import SignupPage from "@/app/signup/page";
import type { Campaign, Health, Lead, Source } from "@/lib/api";
import type { WelcomeTenant } from "./welcome-data";

const mocks = vi.hoisted(() => ({
  api: { tenant: vi.fn(), stats: vi.fn(), leads: vi.fn(), campaigns: vi.fn(), sources: vi.fn(), credits: vi.fn(), health: vi.fn(), targets: vi.fn(), onboarding: vi.fn(), scan: vi.fn(), login: vi.fn(), signup: vi.fn() },
  saveTokens: vi.fn(),
  router: { push: vi.fn(), replace: vi.fn() },
}));
vi.mock("@/lib/api", () => ({ api: mocks.api, API_URL: "https://api.example" }));
vi.mock("@/lib/auth", () => ({ saveTokens: mocks.saveTokens }));
vi.mock("next/navigation", () => ({ useRouter: () => mocks.router }));
vi.mock("@/components/shell", () => ({
  PageHeader: ({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) => <header><h1>{title}</h1><p>{description}</p>{actions}</header>,
}));

const clients: QueryClient[] = [];
const tokens = { access_token: "access-token", refresh_token: "refresh-token" };
const tenant: WelcomeTenant = { id: "tenant", name: "Test workspace", website: null, icp: {}, onboarding_complete: false };
const health: Health = { status: "ok", version: "1.0.0", providers: { llm: "heuristic", enrichment: "none", stripe: false, google_oauth: true, outreach_enabled: false, outreach_dry_run: true } };
const source: Source = { id: "news", kind: "news", name: "Company news", enabled: true, config: {}, daily_quota: 100, last_run_at: "2026-11-11T09:00:00Z", last_status: "ok", last_error: null };
const lead = (overrides: Partial<Lead> = {}): Lead => ({ id: "lead-a", company: "Actual Labs", domain: "actual.example", reason: "Published a dated hiring announcement", signal_at: "2026-11-10T09:00:00Z", signal_age_days: 1, score: 5.5, fit: "fit", fit_confidence: 0.8, fit_reason: null, verification_status: "verified", status: "new", linkedin_url: null, email: null, claimed_at: null, created_at: "2026-11-11T09:00:00Z", contact: null, ...overrides });
const campaign = (status: string, id: string): Campaign => ({ id, name: `${status} campaign`, status, daily_cap: 10, pause_reason: status === "paused" ? "Needs review" : null, created_at: "2026-11-11T09:00:00Z" });

beforeEach(() => {
  // Match Next's automatic JSX without changing the shared Vitest configuration.
  vi.stubGlobal("React", React);
  for (const mock of Object.values(mocks.api)) mock.mockReset();
  mocks.saveTokens.mockReset();
  mocks.router.push.mockReset();
  mocks.router.replace.mockReset();
  mocks.api.tenant.mockResolvedValue(tenant);
  mocks.api.stats.mockResolvedValue({ signals_7d: 37, replies_unread: 4 });
  mocks.api.leads.mockResolvedValue({ items: [lead(), lead({ id: "lead-b", company: "Other Studio", domain: "other.example", fit: "unknown", signal_age_days: null })], next_cursor: "more" });
  mocks.api.campaigns.mockResolvedValue([campaign("running", "running"), campaign("draft", "draft"), campaign("paused", "paused")]);
  mocks.api.sources.mockResolvedValue([source]);
  mocks.api.credits.mockResolvedValue({ balance: 51, free_leads_used: 7, free_leads_remaining: 3, lead_price_credits: 2, spend_report: { credits_spent: 5, credits_purchased: 56 } });
  mocks.api.health.mockResolvedValue(health);
  mocks.api.targets.mockResolvedValue({ items: [], next_cursor: null });
  mocks.api.onboarding.mockResolvedValue({ id: "tenant", name: "Test workspace", icp: { offer: "An extracted offer", buyers: ["Head of Sales"], roles: ["sales development"] } });
  mocks.api.scan.mockResolvedValue({ status: "started" });
  mocks.api.login.mockResolvedValue(tokens);
  mocks.api.signup.mockResolvedValue(tokens);
});

afterEach(() => {
  for (const client of clients.splice(0)) client.clear();
  vi.unstubAllGlobals();
});

function renderPage(Page: React.ComponentType) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, refetchOnWindowFocus: false }, mutations: { retry: false } } });
  clients.push(client);
  const result = render(<QueryClientProvider client={client}><Page /></QueryClientProvider>);
  return { ...result, client };
}

async function readySetup() {
  const rendered = renderPage(OnboardingPage);
  await waitFor(() => expect(screen.getByLabelText("What do you sell?").matches(":disabled")).toBe(false));
  return rendered;
}

function fillSetup(targets = "Acme,acme.example,US") {
  fireEvent.change(screen.getByLabelText("What do you sell?"), { target: { value: "Our practical offer" } });
  fireEvent.change(screen.getByLabelText("Buyer personas"), { target: { value: "VP Sales, Founder" } });
  fireEvent.change(screen.getByLabelText(/Hiring keywords/), { target: { value: "sales development" } });
  fireEvent.change(screen.getByLabelText(/Companies to add/), { target: { value: targets } });
}

describe("overview", () => {
  it("renders live statistics and a correctly bounded recent-lead preview", async () => {
    renderPage(OverviewPage);
    await screen.findByRole("link", { name: "Signals · last 7 days: 37" });
    expect(screen.getByRole("link", { name: "Unread replies: 4" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Running campaigns: 1" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Credit balance: 51" })).toBeTruthy();
    expect(mocks.api.leads).toHaveBeenCalledWith({ limit: 6 });
    expect(screen.getByText("Actual Labs").closest("a")?.getAttribute("href")).toBe("/leads/lead-a");
    expect(screen.getByText("Showing the 2 latest leads, not your full lead count.")).toBeTruthy();
    expect(screen.getByText("Undated signal")).toBeTruthy();
    expect(screen.getByText("Last scan OK")).toBeTruthy();
    expect(screen.getByText("Live outreach is disabled.")).toBeTruthy();
  });

  it("uses real zeroes and useful empty states, never sample leads or campaigns", async () => {
    mocks.api.stats.mockResolvedValue({ signals_7d: 0, replies_unread: 0 });
    mocks.api.leads.mockResolvedValue({ items: [], next_cursor: null });
    mocks.api.campaigns.mockResolvedValue([]);
    mocks.api.sources.mockResolvedValue([]);
    renderPage(OverviewPage);
    await screen.findByRole("link", { name: "Signals · last 7 days: 0" });
    expect(screen.getByRole("link", { name: "Unread replies: 0" })).toBeTruthy();
    expect(screen.getByText("Your next good lead starts here")).toBeTruthy();
    expect(screen.getByText("No sources configured")).toBeTruthy();
    expect(screen.getByText("A thoughtful first message.")).toBeTruthy();
    expect(screen.queryByText("Acme AI")).toBeNull();
    expect(screen.queryByText("Actual Labs")).toBeNull();
  });

  it("keeps failed statistics unavailable instead of presenting zeroes", async () => {
    mocks.api.stats.mockRejectedValue(new Error("Stats unavailable"));
    renderPage(OverviewPage);
    await screen.findByRole("link", { name: "Signals · last 7 days: unavailable" });
    expect(screen.getByRole("link", { name: "Unread replies: unavailable" })).toBeTruthy();
    expect(screen.getByText("Actual Labs")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Signals · last 7 days: 0" })).toBeNull();
  });

  it("lets a source retry recover without hiding successful sections", async () => {
    mocks.api.sources.mockRejectedValueOnce(new Error("Sources unavailable"));
    renderPage(OverviewPage);
    await screen.findByText("Could not load source health.");
    expect(screen.getByRole("link", { name: "Signals · last 7 days: 37" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByText("Last scan OK");
    expect(mocks.api.sources).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("Could not load source health.")).toBeNull();
  });

  it("requests a scan only when setup and enabled sources are loaded", async () => {
    mocks.api.tenant.mockResolvedValue({ ...tenant, onboarding_complete: true });
    renderPage(OverviewPage);
    const button = await screen.findByRole("button", { name: "Run scan" });
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(button);
    await waitFor(() => expect(mocks.api.scan).toHaveBeenCalledWith({ wait: false }));
    expect(await screen.findByText(/Scan requested\. It runs in the background/)).toBeTruthy();
  });
});

describe("authentication", () => {
  it("keeps one account-switch link without decorative form labels", () => {
    const login = renderPage(LoginPage);
    expect(screen.getAllByRole("link", { name: "Create an account" })).toHaveLength(1);
    expect(screen.queryByRole("link", { name: "Create one" })).toBeNull();
    expect(screen.queryByText("Your workspace awaits")).toBeNull();
    expect(screen.queryByText("A little more context. A better first conversation.")).toBeNull();
    login.unmount();
    renderPage(SignupPage);
    expect(screen.getAllByRole("link", { name: "Sign in" })).toHaveLength(1);
    expect(screen.queryByText("Your next chapter")).toBeNull();
  });

  it("preserves password reveal, saves tokens, clears stale workspace data, and lands at overview", async () => {
    const { client } = renderPage(LoginPage);
    client.setQueryData(["old-workspace"], { private: "previous tenant" });
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "owner@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "unchanged password " } });
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect((screen.getByLabelText("Password") as HTMLInputElement).type).toBe("text");
    fireEvent.click(screen.getByRole("button", { name: "Hide password" }));
    fireEvent.submit(screen.getByRole("button", { name: "Sign in" }).closest("form")!);
    await waitFor(() => expect(mocks.router.replace).toHaveBeenCalledWith("/overview"));
    expect(mocks.api.login).toHaveBeenCalledWith({ email: "owner@example.com", password: "unchanged password " });
    expect(mocks.saveTokens).toHaveBeenCalledWith(tokens);
    expect(client.getQueryData(["old-workspace"])).toBeUndefined();
  });

  it("locks duplicate authentication attempts while a request is pending", async () => {
    let resolveLogin!: (value: typeof tokens) => void;
    mocks.api.login.mockImplementation(() => new Promise((resolve) => { resolveLogin = resolve; }));
    renderPage(LoginPage);
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "owner@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "long password" } });
    const form = screen.getByRole("button", { name: "Sign in" }).closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(mocks.api.login).toHaveBeenCalledTimes(1);
    expect((screen.getByRole("button", { name: "Signing in…" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("button", { name: "Signing in…" }).querySelector("svg")?.classList.contains("motion-reduce:animate-none")).toBe(true);
    expect((screen.getByLabelText("Password") as HTMLInputElement).disabled).toBe(true);
    await act(async () => resolveLogin(tokens));
    await waitFor(() => expect(mocks.router.replace).toHaveBeenCalledWith("/overview"));
  });

  it("shows an actionable credential error without navigating or losing entered values", async () => {
    mocks.api.login.mockRejectedValue(new Error("Email or password is incorrect."));
    renderPage(LoginPage);
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "owner@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "long password" } });
    fireEvent.submit(screen.getByRole("button", { name: "Sign in" }).closest("form")!);
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Email or password is incorrect.");
    expect(mocks.router.replace).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Email address") as HTMLInputElement).value).toBe("owner@example.com");
    expect((screen.getByRole("button", { name: "Sign in" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("preserves the Google OAuth endpoint when configured", async () => {
    renderPage(LoginPage);
    expect((await screen.findByRole("link", { name: "Continue with Google" })).getAttribute("href")).toBe("https://api.example/v1/auth/google");
  });

  it("explains unconfigured Google sign-in instead of offering a broken link", async () => {
    mocks.api.health.mockResolvedValue({ ...health, providers: { ...health.providers, google_oauth: false } });
    renderPage(SignupPage);
    await screen.findByText("Google sign-in is not configured. Use email and password instead.");
    expect((screen.getByRole("button", { name: "Continue with Google" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("link", { name: "Continue with Google" })).toBeNull();
  });

  it("keeps signup buyer setup, optional identity fields, and the password requirements intact", async () => {
    renderPage(SignupPage);
    fireEvent.change(screen.getByLabelText(/Your name/), { target: { value: "  Alex  " } });
    fireEvent.change(screen.getByLabelText(/^Company/), { target: { value: "  Practical Co  " } });
    fireEvent.change(screen.getByLabelText("Work email"), { target: { value: "alex@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "a long passphrase" } });
    const password = screen.getByLabelText("Password") as HTMLInputElement;
    expect(password.minLength).toBe(10);
    expect(password.autocomplete).toBe("new-password");
    fireEvent.submit(screen.getByRole("button", { name: "Create workspace" }).closest("form")!);
    await waitFor(() => expect(mocks.router.replace).toHaveBeenCalledWith("/onboarding"));
    expect(mocks.api.signup).toHaveBeenCalledWith({ name: "Alex", company_name: "Practical Co", email: "alex@example.com", password: "a long passphrase" });
    expect(mocks.saveTokens).toHaveBeenCalledWith(tokens);
  });
});

describe("buyer onboarding", () => {
  it("builds an editable brief without redirecting or starting a scan", async () => {
    await readySetup();
    fireEvent.change(screen.getByLabelText(/Company website/), { target: { value: "vendor.example" } });
    fireEvent.click(screen.getByRole("button", { name: "Build brief" }));
    await screen.findByText(/Website and brief saved/);
    expect((screen.getByLabelText("What do you sell?") as HTMLTextAreaElement).value).toBe("An extracted offer");
    expect((screen.getByLabelText("Buyer personas") as HTMLInputElement).value).toBe("Head of Sales");
    expect(mocks.router.replace).not.toHaveBeenCalled();
    expect(mocks.api.scan).not.toHaveBeenCalled();
    expect(mocks.api.onboarding).toHaveBeenCalledWith({ website: "https://vendor.example/", offer: undefined, buyers: undefined, roles: undefined, targets: [], discover: false });
  });

  it("does not overwrite manually cleared persona fields after a tenant refetch", async () => {
    mocks.api.tenant.mockResolvedValue({ ...tenant, icp: { offer: "Saved offer", buyers: ["Founder"] } });
    const { client } = await readySetup();
    expect((screen.getByLabelText("Buyer personas") as HTMLInputElement).value).toBe("Founder");
    fireEvent.change(screen.getByLabelText("Buyer personas"), { target: { value: "" } });
    await act(async () => { await client.invalidateQueries({ queryKey: ["tenant"] }); });
    expect((screen.getByLabelText("Buyer personas") as HTMLInputElement).value).toBe("");
  });

  it("saves a manual buyer brief and targets before continuing to overview", async () => {
    await readySetup();
    fillSetup();
    fireEvent.click(screen.getByRole("button", { name: "Save and continue" }));
    await waitFor(() => expect(mocks.router.replace).toHaveBeenCalledWith("/overview"));
    expect(mocks.api.onboarding).toHaveBeenCalledWith({ website: undefined, offer: "Our practical offer", buyers: ["VP Sales", "Founder"], roles: ["sales development"], targets: [{ company: "Acme", domain: "acme.example", country: "US" }], discover: false });
    expect(mocks.api.scan).not.toHaveBeenCalled();
  });

  it("waits for saving before requesting a background scan", async () => {
    let resolveSave!: (value: unknown) => void;
    mocks.api.onboarding.mockImplementation(() => new Promise((resolve) => { resolveSave = resolve; }));
    await readySetup();
    fillSetup();
    fireEvent.click(screen.getByRole("button", { name: "Save and run scan" }));
    await waitFor(() => expect(mocks.api.onboarding).toHaveBeenCalledTimes(1));
    expect(mocks.api.scan).not.toHaveBeenCalled();
    expect((screen.getByRole("button", { name: "Saving setup…" }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => resolveSave({ id: "tenant", name: "Workspace", icp: {} }));
    await waitFor(() => expect(mocks.api.scan).toHaveBeenCalledWith({ wait: false }));
    await screen.findByText(/Setup saved and scan requested/);
    expect(screen.getByRole("link", { name: "Go to overview" }).getAttribute("href")).toBe("/overview");
  });

  it("does not run a scan when saving fails", async () => {
    mocks.api.onboarding.mockRejectedValue(new Error("Could not save the buyer brief."));
    await readySetup();
    fillSetup();
    fireEvent.click(screen.getByRole("button", { name: "Save and run scan" }));
    await screen.findByText("Could not save the buyer brief.");
    expect(mocks.api.scan).not.toHaveBeenCalled();
    expect(mocks.router.replace).not.toHaveBeenCalled();
  });

  it("retains saved setup when scanning fails and offers a safe next destination", async () => {
    mocks.api.scan.mockRejectedValue(new Error("No scan worker is available."));
    await readySetup();
    fillSetup();
    fireEvent.click(screen.getByRole("button", { name: "Save and run scan" }));
    await screen.findByText(/Your buyer brief and target list are saved, but the scan could not start/);
    expect(screen.getByRole("link", { name: "Go to overview" }).getAttribute("href")).toBe("/overview");
    expect((screen.getByLabelText("What do you sell?") as HTMLTextAreaElement).value).toBe("Our practical offer");
    expect(mocks.router.replace).not.toHaveBeenCalled();
  });

  it("blocks malformed CSV instead of silently saving a partial target list", async () => {
    await readySetup();
    fillSetup("Valid,valid.example\nMissing domain");
    fireEvent.click(screen.getByRole("button", { name: "Save and continue" }));
    await screen.findByText("Line 2: use company, domain, and an optional two-letter country.");
    expect(mocks.api.onboarding).not.toHaveBeenCalled();
    expect(mocks.api.scan).not.toHaveBeenCalled();
  });

  it("allows saving but explains why scanning is disabled when no sources are enabled", async () => {
    mocks.api.sources.mockResolvedValue([{ ...source, enabled: false }]);
    await readySetup();
    expect((screen.getByRole("button", { name: "Save and run scan" }) as HTMLButtonElement).disabled).toBe(true);
    expect(await screen.findByText(/No sources are enabled yet/)).toBeTruthy();
    fillSetup();
    fireEvent.click(screen.getByRole("button", { name: "Save and continue" }));
    await waitFor(() => expect(mocks.router.replace).toHaveBeenCalledWith("/overview"));
    expect(mocks.api.scan).not.toHaveBeenCalled();
  });
});
