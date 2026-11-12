import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AuditPage from "@/app/(app)/audit/page";
import CreditsPage from "@/app/(app)/credits/page";
import LinkedinPage from "@/app/(app)/linkedin/page";
import SettingsPage from "@/app/(app)/settings/page";
import { AccountAgents } from "@/components/account-agents";
import type { AuditEntry, Order } from "@/lib/api";

const mocks = vi.hoisted(() => ({
  params: "",
  request: vi.fn(),
  api: {
    tenant: vi.fn(), health: vi.fn(), members: vi.fn(), apiKeys: vi.fn(), createApiKey: vi.fn(), revokeApiKey: vi.fn(),
    webhooks: vi.fn(), createWebhook: vi.fn(), deleteWebhook: vi.fn(),
    credits: vi.fn(), ledger: vi.fn(), orders: vi.fn(), topUp: vi.fn(),
    linkedin: vi.fn(), linkedinLimits: vi.fn(), connectLinkedin: vi.fn(), pauseLinkedin: vi.fn(), resumeLinkedin: vi.fn(), disconnectLinkedin: vi.fn(),
    audit: vi.fn(),
  },
}));
vi.mock("@/lib/api", () => ({ api: mocks.api, request: mocks.request, MCP_URL: "http://localhost:8765/mcp" }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(mocks.params) }));
vi.mock("@/components/shell", () => ({
  PageHeader: ({ title, description }: { title: string; description?: string }) => <header><h1>{title}</h1><p>{description}</p></header>,
}));

const clients: QueryClient[] = [];
const account = { id: "linkedin-1", handle: "Riley", status: "paused", connected_at: "2026-11-11T09:00:00Z", paused_reason: "Reviewing messages" };
const key = { id: "key-1", name: "Research agent", prefix: "lmk_secr", created_at: "2026-11-11T09:00:00Z", last_used_at: null };
const order: Order = { id: "order-1", status: "pending", credits: 100, amount_cents: 4900, currency: "usd", checkout_url: null, created_at: "2026-11-11T09:00:00Z" };
const auditEntry = (id: string, action: string, actorType: string, actorId: string | null): AuditEntry => ({ id, action, actor_type: actorType, actor_id: actorId, target_type: "lead", target_id: `lead-${id}`, created_at: "2026-11-11T09:00:00Z" });

beforeEach(() => {
  vi.stubGlobal("React", React);
  for (const mock of Object.values(mocks.api)) mock.mockReset();
  mocks.request.mockReset();
  mocks.params = "";
  window.history.replaceState(null, "", "/settings#workspace");
  mocks.api.tenant.mockResolvedValue({ id: "tenant-1", name: "Actual Labs", website: "https://actual.example", icp: { offer: "Compliance software", buyers: ["CTOs"], roles: ["engineering"], region: "US", exclusions: [] }, onboarding_complete: true });
  mocks.api.health.mockResolvedValue({ status: "ok", version: "1.0.0", providers: { llm: "heuristic", enrichment: "none", stripe: false, google_oauth: false, outreach_enabled: false, outreach_dry_run: true } });
  mocks.api.members.mockResolvedValue([{ id: "member-1", user_id: "user-1", name: "Riley Chen", email: "riley@example.com", role: "owner" }]);
  mocks.api.apiKeys.mockResolvedValue([]);
  mocks.api.createApiKey.mockImplementation(() => {
    mocks.api.apiKeys.mockResolvedValue([key]);
    return Promise.resolve({ ...key, api_key: "lmk_secret" });
  });
  mocks.api.revokeApiKey.mockImplementation(() => { mocks.api.apiKeys.mockResolvedValue([]); return Promise.resolve(); });
  mocks.api.webhooks.mockResolvedValue([]);
  mocks.api.credits.mockResolvedValue({ balance: 0, free_leads_remaining: 10, free_leads_used: 0, lead_price_credits: 1, spend_report: { credits_spent: 0, credits_purchased: 0 } });
  mocks.api.ledger.mockResolvedValue({ items: [], next_cursor: null });
  mocks.api.orders.mockResolvedValue([order]);
  mocks.api.topUp.mockResolvedValue(order);
  mocks.api.linkedin.mockResolvedValue([account]);
  mocks.api.linkedinLimits.mockResolvedValue({ connected: false, current_daily_cap: 5, dry_run: false, outreach_enabled: true });
  mocks.api.resumeLinkedin.mockImplementation(() => {
    const updated = { ...account, status: "connected", paused_reason: null };
    mocks.api.linkedin.mockResolvedValue([updated]);
    return Promise.resolve(updated);
  });
  mocks.api.disconnectLinkedin.mockImplementation(() => { mocks.api.linkedin.mockResolvedValue([{ ...account, status: "disconnected" }]); return Promise.resolve(); });
  mocks.api.audit.mockResolvedValue({ items: [], next_cursor: null });
});

afterEach(() => {
  for (const client of clients.splice(0)) client.clear();
  vi.unstubAllGlobals();
});

function renderPage(Page: React.ComponentType) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, refetchOnWindowFocus: false }, mutations: { retry: false } } });
  clients.push(client);
  return render(<QueryClientProvider client={client}><Page /></QueryClientProvider>);
}

describe("account settings", () => {
  it("supports direct hash sections and preserves a one-time key across navigation", async () => {
    window.history.replaceState(null, "", "/settings#agents");
    renderPage(SettingsPage);
    await screen.findByText("MCP endpoint");
    expect(screen.getByRole("link", { name: "Agents & API" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByText("http://localhost:8765/mcp")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Create key" }));
    await screen.findByText("lmk_secret");
    fireEvent.click(screen.getByRole("link", { name: "Team" }));
    await screen.findByRole("heading", { name: "Workspace members" });
    act(() => { window.history.replaceState(null, "", "/settings#agents"); window.dispatchEvent(new Event("hashchange")); });
    await screen.findByText("lmk_secret");
    expect(mocks.api.createApiKey).toHaveBeenCalledTimes(1);
    expect(mocks.api.createApiKey).toHaveBeenCalledWith("Agent key");
  });

  it("clears the one-time key and config if that key is revoked", async () => {
    renderPage(AccountAgents);
    fireEvent.click(screen.getByRole("button", { name: "Create key" }));
    await screen.findByText("lmk_secret");
    fireEvent.click(await screen.findByRole("button", { name: "Revoke" }));
    const dialog = await screen.findByRole("dialog");
    expect(mocks.api.revokeApiKey).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Revoke key" }));
    await waitFor(() => expect(screen.queryByText("lmk_secret")).toBeNull());
    expect(screen.queryByText(/Bearer lmk_secret/)).toBeNull();
    expect(mocks.api.revokeApiKey).toHaveBeenCalledWith("key-1");
  });
});

describe("credit order verification", () => {
  it("does not confirm a pending payment from the return URL", async () => {
    mocks.params = "status=success&order=order-1";
    renderPage(CreditsPage);
    await screen.findByText("Waiting for payment confirmation");
    expect(screen.queryByText("Payment confirmed")).toBeNull();
  });

  it("shows payment confirmation only for a matching server-paid order", async () => {
    mocks.params = "status=success&order=order-1";
    mocks.api.orders.mockResolvedValue([{ ...order, status: "paid" }]);
    renderPage(CreditsPage);
    await screen.findByText("Payment confirmed");
    expect(screen.getByText(/The server has marked this order paid/)).toBeTruthy();
  });

  it("reviews authoritative order totals and handles unavailable checkout honestly", async () => {
    mocks.api.topUp.mockResolvedValue({ ...order, id: "custom-order", credits: 250, amount_cents: 9000 });
    renderPage(CreditsPage);
    fireEvent.click((await screen.findAllByRole("button", { name: "Create pending order" }))[0]);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("250")).toBeTruthy();
    expect(within(dialog).getByText("$90.00")).toBeTruthy();
    expect(within(dialog).getByText(/No checkout URL was issued/)).toBeTruthy();
    expect(within(dialog).queryByRole("button", { name: /Continue to checkout/ })).toBeNull();
    expect(mocks.api.topUp).toHaveBeenCalledWith(1);
  });
});

describe("LinkedIn controls", () => {
  it("requires explicit confirmation before resuming live outreach", async () => {
    renderPage(LinkedinPage);
    fireEvent.click(await screen.findByRole("button", { name: "Resume outreach" }));
    const dialog = await screen.findByRole("dialog");
    expect(mocks.api.resumeLinkedin).not.toHaveBeenCalled();
    expect(within(dialog).getByText(/Resuming does not validate the session/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Resume outreach" }));
    await waitFor(() => expect(mocks.api.resumeLinkedin).toHaveBeenCalledTimes(1));
  });

  it("requires confirmation to remove a session and does not offer resume afterwards", async () => {
    renderPage(LinkedinPage);
    fireEvent.click(await screen.findByRole("button", { name: "Disconnect" }));
    const dialog = await screen.findByRole("dialog");
    expect(mocks.api.disconnectLinkedin).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Disconnect session" }));
    await screen.findByText(/No session is stored. Reconnect below/);
    expect(mocks.api.disconnectLinkedin).toHaveBeenCalledWith("linkedin-1");
    expect(screen.queryByRole("button", { name: "Resume outreach" })).toBeNull();
  });

  it("rejects malformed session JSON before sending it to the API", async () => {
    mocks.api.linkedin.mockResolvedValue([]);
    renderPage(LinkedinPage);
    await screen.findByText("No LinkedIn account connected");
    fireEvent.change(screen.getByLabelText("Storage state JSON"), { target: { value: "invalid json" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /I understand the platform risk/ }));
    fireEvent.click(screen.getByRole("button", { name: "Store session" }));
    await screen.findByText(/That is not valid JSON/);
    expect(mocks.api.connectLinkedin).not.toHaveBeenCalled();
  });
});

describe("audit history", () => {
  it("searches human actor names and can load older server history", async () => {
    mocks.api.apiKeys.mockResolvedValue([key]);
    mocks.api.audit.mockResolvedValue({ items: [auditEntry("a", "api_key.created", "user", "user-1"), auditEntry("b", "order.paid", "system", null)], next_cursor: "older" });
    mocks.request.mockResolvedValue({ items: [auditEntry("c", "lead.claimed", "api_key", "key-1")], next_cursor: null });
    renderPage(AuditPage);
    await screen.findByText("API key created");
    fireEvent.change(screen.getByRole("searchbox", { name: "Search audit log" }), { target: { value: "Riley" } });
    expect(screen.getByText("API key created")).toBeTruthy();
    expect(screen.queryByText("Credit order paid")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Load older events" }));
    await waitFor(() => expect(mocks.request).toHaveBeenCalledWith("/v1/audit?limit=50&cursor=older"));
    fireEvent.change(screen.getByRole("searchbox", { name: "Search audit log" }), { target: { value: "Research agent" } });
    await screen.findByText("Lead claimed");
    expect(screen.getByText("1 of 3 loaded events")).toBeTruthy();
  });
});
