// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SignalsPage from "@/app/(app)/signals/page";
import type { SignalCatalog, SignalDef, Source } from "@/lib/api";
import { applySignalToggle } from "@/lib/signal-catalog";

const api = vi.hoisted(() => ({ signalCatalog: vi.fn(), sources: vi.fn(), setSignal: vi.fn(), scan: vi.fn() }));
vi.mock("@/lib/api", () => ({ api }));
vi.mock("@/components/shell", () => ({
  PageHeader: ({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) => (
    <header><h1>{title}</h1><p>{description}</p>{actions}</header>
  ),
}));

function entry(overrides: Partial<SignalDef> = {}): SignalDef {
  return {
    id: "funding",
    label: "Just raised money",
    description: "A recent funding announcement.",
    why_now: "A new budget to support growth.",
    how_it_works: "Read recent company news.",
    status: "live",
    status_label: "Live",
    channels: ["email"],
    adapters: ["news"],
    automatic: true,
    enabled: true,
    ...overrides,
  };
}

function feed(kind: string, enabled = true): Source {
  return { id: kind, kind, name: kind === "news" ? "Company news" : "Reddit", enabled, config: {}, daily_quota: 100, last_run_at: null, last_status: null, last_error: null };
}

let catalog: SignalCatalog;
let sources: Source[];
const clients: QueryClient[] = [];

beforeEach(() => {
  // Next uses automatic JSX; this also supports the harness's plugin-free
  // Vitest transform without changing its shared configuration.
  vi.stubGlobal("React", React);
  for (const mock of Object.values(api)) mock.mockReset();
  catalog = {
    categories: [
      { id: "growing", label: "Growing", signals: [entry(), entry({ id: "launch", label: "Launching a new product", enabled: false, status: "partly_live" })] },
      { id: "asking", label: "Asking now", signals: [entry({ id: "alternative", label: "Looking for an alternative", why_now: "They want to switch tools.", adapters: ["news", "reddit"], status: "partly_live" })] },
      { id: "events", label: "Events", signals: [entry({ id: "speaking", label: "Speaking at an event", description: "Speakers at industry events.", why_now: "They are visible in your industry.", enabled: false, automatic: false, status: "by_hand", status_label: "By hand", adapters: [], how_it_works: "We research it by hand when you order leads on it." })] },
    ],
    legend: { by_hand: "We research it by hand when you order leads on it." },
  };
  sources = [feed("news"), feed("reddit")];
  api.signalCatalog.mockImplementation(async () => catalog);
  api.sources.mockImplementation(async () => sources);
  api.setSignal.mockImplementation(async (id: string, enabled: boolean) => {
    catalog = applySignalToggle(catalog, { id, enabled });
    return { id, enabled };
  });
  api.scan.mockResolvedValue({ status: "started" });
});

afterEach(() => {
  for (const client of clients.splice(0)) client.clear();
  vi.unstubAllGlobals();
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0, gcTime: 0, refetchOnWindowFocus: false }, mutations: { retry: false } } });
  clients.push(client);
  return render(<QueryClientProvider client={client}><SignalsPage /></QueryClientProvider>);
}

async function showCatalog() {
  fireEvent.click(await screen.findByRole("button", { name: /^Full catalog/ }));
}

describe("signals browser", () => {
  it("separates saved choices from the complete catalog and disables planned controls", async () => {
    const { container } = renderPage();
    await screen.findByRole("switch", { name: "Disable Just raised money" });
    expect(screen.queryByRole("heading", { name: "Launching a new product" })).toBeNull();
    expect(screen.getByRole("button", { name: /^Your signals 2$/ }).getAttribute("aria-pressed")).toBe("true");

    await showCatalog();
    expect(screen.getAllByRole("switch")).toHaveLength(4);
    const planned = screen.getByRole("switch", { name: "Speaking at an event: not automated, planned" }) as HTMLButtonElement;
    expect(planned.disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Not automated" }) as HTMLButtonElement).disabled).toBe(true);
    expect(container.textContent).not.toContain("research it by hand when you order");
    fireEvent.click(planned);
    expect(api.setSignal).not.toHaveBeenCalled();
  });

  it("combines search, category, and status without changing saved enabled counts", async () => {
    renderPage();
    await showCatalog();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "budget" } });
    expect(screen.getAllByRole("switch")).toHaveLength(2);
    fireEvent.change(screen.getByLabelText("Filter by category"), { target: { value: "growing" } });
    fireEvent.change(screen.getByLabelText("Filter by status"), { target: { value: "enabled" } });
    expect(screen.getAllByRole("switch")).toHaveLength(1);
    expect(screen.getByRole("button", { name: /^Your signals 2$/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getAllByRole("switch")).toHaveLength(4);
    fireEvent.change(screen.getByLabelText("Filter by status"), { target: { value: "by_hand" } });
    expect(screen.getAllByRole("switch")).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "Speaking at an event" })).toBeTruthy();
  });

  it("keeps every switch locked until both catalog and source refetches finish", async () => {
    renderPage();
    await showCatalog();
    let finishCatalog!: (value: SignalCatalog) => void;
    let finishSources!: (value: Source[]) => void;
    api.signalCatalog.mockImplementationOnce(() => new Promise<SignalCatalog>((resolve) => { finishCatalog = resolve; }));
    api.sources.mockImplementationOnce(() => new Promise<Source[]>((resolve) => { finishSources = resolve; }));

    fireEvent.click(screen.getByRole("switch", { name: "Disable Just raised money" }));
    await waitFor(() => expect(api.setSignal).toHaveBeenCalledWith("funding", false));
    await waitFor(() => expect(api.sources).toHaveBeenCalledTimes(2));
    expect((screen.getByRole("switch", { name: "Enable Just raised money" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("switch", { name: "Disable Looking for an alternative" }) as HTMLButtonElement).disabled).toBe(true);

    await act(async () => finishCatalog(catalog));
    expect((screen.getByRole("switch", { name: "Enable Just raised money" }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => finishSources(sources));
    await waitFor(() => expect((screen.getByRole("switch", { name: "Enable Just raised money" }) as HTMLButtonElement).disabled).toBe(false));
    expect(screen.getByRole("button", { name: /^Your signals 1$/ })).toBeTruthy();
  });

  it("preserves confirmed choices and the real permission error when a toggle fails", async () => {
    api.setSignal.mockRejectedValue(new Error("Read-only access cannot change signals."));
    renderPage();
    await screen.findByRole("switch", { name: "Disable Just raised money" });
    fireEvent.click(screen.getByRole("switch", { name: "Disable Just raised money" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Read-only access cannot change signals.");
    await waitFor(() => expect(api.sources).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("switch", { name: "Disable Just raised money" }).getAttribute("aria-checked")).toBe("true");
  });

  it("queues only enabled shared feeds and does not promise a successful lead result", async () => {
    sources = [feed("news"), feed("reddit", false)];
    renderPage();
    await screen.findByRole("switch", { name: "Disable Just raised money" });
    await waitFor(() => expect((screen.getAllByRole("button", { name: "Find leads" })[0] as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getAllByRole("button", { name: "Find leads" })[0]);
    await waitFor(() => expect(api.scan).toHaveBeenCalledWith({ sources: ["news"], wait: false }));
    expect((await screen.findByRole("status")).textContent).toContain("Search queued for 1 shared feed");
    expect(screen.getByRole("status").textContent).toContain("new matches, if any");
    expect(api.sources).toHaveBeenCalledTimes(2);
  });

  it("does not allow a missing source list to become an all-source scan", async () => {
    sources = [];
    renderPage();
    await screen.findByRole("switch", { name: "Disable Just raised money" });
    expect((screen.getAllByRole("button", { name: "Find leads" })[0] as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getAllByRole("button", { name: "Find leads" })[0]);
    expect(api.scan).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toContain("none of their mapped source feeds are enabled");
  });

  it("shows unknown source status honestly and restores searching after a successful retry", async () => {
    api.sources.mockRejectedValue(new Error("Source status is offline."));
    renderPage();
    await screen.findByRole("alert");
    expect(screen.getByRole("alert").textContent).toContain("Source status is offline.");
    expect((screen.getAllByRole("button", { name: "Find leads" })[0] as HTMLButtonElement).disabled).toBe(true);
    api.sources.mockResolvedValue(sources);
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect((screen.getAllByRole("button", { name: "Find leads" })[0] as HTMLButtonElement).disabled).toBe(false));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
