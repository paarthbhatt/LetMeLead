import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { NAVIGATION_ITEMS } from "@/lib/navigation";
import { Providers, THEME_STORAGE_KEY } from "./providers";
import { AppShell } from "./shell";
import { stubLocalStorage } from "../tests/browser-storage";

const navigation = vi.hoisted(() => ({ pathname: "/overview", router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() } }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname, useRouter: () => navigation.router }));

const identity = { user: { id: "u1", name: "Jane Rivera", email: "jane@example.com" }, tenants: [{ id: "w1", name: "Acme Studio", slug: "acme", role: "owner" }], active_tenant_id: "w1" };
const workspace = { id: "w1", name: "Acme Studio", website: null, icp: {}, onboarding_complete: true };
const creditBalance = { balance: 0, free_leads_used: 3, free_leads_remaining: 7, lead_price_credits: 1, spend_report: { credits_spent: 4, credits_purchased: 4 } };

beforeEach(() => {
  navigation.pathname = "/overview";
  stubLocalStorage();
  window.localStorage.setItem("letmelead.session", JSON.stringify({ accessToken: "test-access", refreshToken: "test-refresh", tenantId: "w1" }));
  window.history.replaceState(null, "", "/overview");
  vi.stubGlobal("matchMedia", vi.fn((query: string) => ({ media: query, matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  vi.spyOn(api, "me").mockResolvedValue(identity);
  vi.spyOn(api, "tenant").mockResolvedValue(workspace);
  vi.spyOn(api, "credits").mockResolvedValue(creditBalance);
});
afterEach(() => vi.unstubAllGlobals());

async function renderShell() {
  const result = render(<Providers><AppShell><h1>Dashboard content</h1></AppShell></Providers>);
  await screen.findByRole("heading", { name: "Dashboard content" });
  await screen.findByText("Acme Studio");
  return result;
}

describe("dashboard shell", () => {
  it("uses real identity, workspace and credit data, including a zero balance", async () => {
    await renderShell();
    await screen.findByText("7 free leads remaining");
    expect(screen.getByText("Jane Rivera")).toBeTruthy();
    expect(screen.getByText("owner · jane@example.com")).toBeTruthy();
    expect(screen.getAllByText("0").length).toBeGreaterThan(0);
    expect(screen.getByText("4 credits spent")).toBeTruthy();
    const links = within(screen.getByRole("navigation", { name: "Main navigation" })).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual(NAVIGATION_ITEMS.map((item) => item.href));
    expect(links.find((link) => link.getAttribute("href") === "/overview")?.getAttribute("aria-current")).toBe("page");
  });

  it("does not fabricate a zero balance while credits are loading", async () => {
    vi.mocked(api.credits).mockReturnValue(new Promise(() => {}));
    await renderShell();
    expect(screen.queryByText("0")).toBeNull();
    expect(screen.queryByText(/credits spent/)).toBeNull();
    expect(screen.queryByText(/free leads remaining/)).toBeNull();
  });

  it("makes every route and help reachable in the mobile menu", async () => {
    await renderShell();
    fireEvent.click(screen.getByRole("button", { name: "Open navigation menu" }));
    const drawer = screen.getByRole("dialog", { name: "LetMeLead" });
    const nav = within(drawer).getByRole("navigation", { name: "Mobile navigation" });
    expect(within(nav).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(NAVIGATION_ITEMS.map((item) => item.href));
    fireEvent.click(within(nav).getByRole("button", { name: "Help & shortcuts" }));
    expect(screen.queryByRole("dialog", { name: "LetMeLead" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "Help & shortcuts" })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens with Ctrl+K, searches commands, and runs the selection with Enter", async () => {
    await renderShell();
    fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    const search = screen.getByRole("combobox", { name: "Search commands" });
    expect(document.activeElement).toBe(search);
    fireEvent.change(search, { target: { value: "billing" } });
    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(screen.getByRole("option").textContent).toContain("Credits");
    fireEvent.keyDown(search, { key: "Enter" });
    expect(navigation.router.push).toHaveBeenCalledWith("/credits");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("wraps arrow-key selection and supports Cmd+K", async () => {
    await renderShell();
    fireEvent.keyDown(document, { key: "k", metaKey: true });
    const search = screen.getByRole("combobox", { name: "Search commands" });
    fireEvent.keyDown(search, { key: "ArrowUp" });
    const last = screen.getAllByRole("option").at(-1)!;
    expect(last.getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(search, { key: "ArrowDown" });
    expect(screen.getAllByRole("option")[0].getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(search, { key: "Enter" });
    expect(navigation.router.push).toHaveBeenCalledWith("/overview");
  });

  it("changes themes through the command palette without navigating", async () => {
    await renderShell();
    fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    const search = screen.getByRole("combobox", { name: "Search commands" });
    fireEvent.change(search, { target: { value: "system theme" } });
    fireEvent.keyDown(search, { key: "Enter" });
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("system");
    expect(document.documentElement.dataset.theme).toBe("system");
    expect(navigation.router.push).not.toHaveBeenCalled();
  });

  it("switches workspaces with real tokens and refreshes tenant data", async () => {
    const otherWorkspace = { id: "w2", name: "River Studio", slug: "river", role: "member" };
    const memberships = [...identity.tenants, otherWorkspace];
    vi.mocked(api.me).mockImplementation(async () => ({ ...identity, tenants: memberships, active_tenant_id: getSession()?.tenantId ?? "w1" }));
    vi.mocked(api.tenant).mockImplementation(async () => getSession()?.tenantId === "w2" ? { ...workspace, id: "w2", name: "River Studio" } : workspace);
    vi.mocked(api.credits).mockImplementation(async () => getSession()?.tenantId === "w2" ? { ...creditBalance, balance: 18, free_leads_remaining: 2 } : creditBalance);
    vi.spyOn(api, "switchTenant").mockResolvedValue({ access_token: "other-access", refresh_token: "other-refresh" });
    render(<Providers><AppShell><h1>Dashboard content</h1></AppShell></Providers>);
    const select = await screen.findByRole("combobox", { name: "Switch workspace" });
    fireEvent.change(select, { target: { value: "w2" } });
    await screen.findByText("2 free leads remaining");
    await waitFor(() => expect(navigation.router.refresh).toHaveBeenCalledOnce());
    expect(api.switchTenant).toHaveBeenCalledWith("w2", expect.anything());
    expect(getSession()).toMatchObject({ tenantId: "w2", accessToken: "other-access", refreshToken: "other-refresh" });
    expect((screen.getByRole("combobox", { name: "Switch workspace" }) as HTMLSelectElement).value).toBe("w2");
    expect(screen.queryByText("7 free leads remaining")).toBeNull();
    expect(screen.getAllByText("18").length).toBeGreaterThan(0);
  });

  it("signs out and hides protected content immediately", async () => {
    await renderShell();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(getSession()).toBeNull();
    expect(navigation.router.replace).toHaveBeenCalledWith("/login");
    expect(screen.queryByRole("heading", { name: "Dashboard content" })).toBeNull();
  });

  it("refreshes identity and workspace data when another tab changes session", async () => {
    await renderShell();
    vi.mocked(api.me).mockResolvedValue({ ...identity, user: { id: "u2", name: "Alex Smith", email: "alex@example.com" }, tenants: [{ id: "w2", name: "River Studio", slug: "river", role: "owner" }], active_tenant_id: "w2" });
    vi.mocked(api.tenant).mockResolvedValue({ ...workspace, id: "w2", name: "River Studio" });
    vi.mocked(api.credits).mockResolvedValue({ ...creditBalance, balance: 18, free_leads_remaining: 2 });
    act(() => {
      const session = JSON.stringify({ accessToken: "other-access", refreshToken: "other-refresh", tenantId: "w2" });
      window.localStorage.setItem("letmelead.session", session);
      window.dispatchEvent(new StorageEvent("storage", { key: "letmelead.session", newValue: session }));
    });
    await screen.findByText("Alex Smith");
    expect(screen.getByText("River Studio")).toBeTruthy();
    expect(screen.queryByText("Acme Studio")).toBeNull();
    expect(screen.queryByText("Jane Rivera")).toBeNull();
  });
});
