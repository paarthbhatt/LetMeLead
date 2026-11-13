import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEMO_AUDIENCES, SAMPLE_DISCLOSURE, SAMPLE_DOSSIERS, type DemoAudienceId } from "./landing-data";
import { ProductDemo } from "./product-demo";

const network = {
  fetch: vi.fn(),
  websocket: vi.fn(),
  eventSource: vi.fn(),
  beacon: vi.fn(),
};

let beaconDescriptor: PropertyDescriptor | undefined;

beforeEach(() => {
  vi.stubGlobal("fetch", network.fetch);
  vi.stubGlobal("WebSocket", network.websocket);
  vi.stubGlobal("EventSource", network.eventSource);
  vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })));
  beaconDescriptor = Object.getOwnPropertyDescriptor(navigator, "sendBeacon");
  Object.defineProperty(navigator, "sendBeacon", { configurable: true, value: network.beacon });
});

afterEach(() => {
  if (beaconDescriptor) Object.defineProperty(navigator, "sendBeacon", beaconDescriptor);
  else Reflect.deleteProperty(navigator, "sendBeacon");
  vi.unstubAllGlobals();
});

function assertDossier(audience: DemoAudienceId) {
  const dossier = SAMPLE_DOSSIERS[audience];
  const article = screen.getByRole("article", { name: `${dossier.company.name} sample dossier` });
  const scope = within(article);
  expect(article.getAttribute("data-demo-audience")).toBe(audience);
  expect((scope.getByRole("textbox", { name: "Sample audience brief" }) as HTMLTextAreaElement).value).toBe(dossier.brief);
  expect(scope.getByText(dossier.offer)).toBeTruthy();
  expect(scope.getByRole("heading", { name: dossier.company.name })).toBeTruthy();
  expect(scope.getByText(dossier.company.domain)).toBeTruthy();
  expect(scope.getByRole("heading", { name: dossier.signal.title })).toBeTruthy();
  expect(scope.getByText(dossier.signal.description)).toBeTruthy();
  expect(article.querySelector("time")!.dateTime).toBe(dossier.signal.publishedOn);
  for (const reason of dossier.fit) expect(scope.getByText(reason.reasoning)).toBeTruthy();
  expect(scope.getByRole("heading", { name: dossier.contact.name })).toBeTruthy();
  expect(scope.getByText(dossier.contact.role)).toBeTruthy();
  expect(scope.getByText(dossier.contact.email)).toBeTruthy();
  expect(scope.getByText(dossier.contact.caveat)).toBeTruthy();
  expect(scope.getByText(dossier.uncertainty)).toBeTruthy();
  expect(scope.getByText(dossier.draft.subject)).toBeTruthy();
  for (const paragraph of dossier.draft.body.split("\n\n")) expect(scope.getByText(paragraph)).toBeTruthy();
  for (const evidence of dossier.evidence) {
    expect(scope.getByText(evidence.sourceUrl)).toBeTruthy();
    expect(scope.getByText(evidence.excerpt)).toBeTruthy();
  }
  return article;
}

describe("ProductDemo sample workflow", () => {
  it("is a standalone, labelled sample section with an honest read-only workflow", () => {
    const { container } = render(<ProductDemo />);
    expect(screen.getByRole("region", { name: "A signal. A reason. A draft." }).id).toBe("demo");
    expect(screen.getByRole("group", { name: "Choose an audience" })).toBeTruthy();
    expect(screen.getAllByRole("radio").map((radio) => (radio as HTMLInputElement).value)).toEqual(["security", "revenue", "agency"]);
    expect(screen.getByText("Illustrative sample")).toBeTruthy();
    expect(screen.getByText("Sample dossier")).toBeTruthy();
    expect(screen.getByText("Sample signal")).toBeTruthy();
    expect(screen.getByText("Unverified sample contact")).toBeTruthy();
    expect(screen.getByText("Sample draft")).toBeTruthy();
    expect(screen.getByText(SAMPLE_DISCLOSURE)).toBeTruthy();
    expect((screen.getByRole("textbox", { name: "Sample audience brief" }) as HTMLTextAreaElement).readOnly).toBe(true);
    expect(container.querySelector("form")).toBeNull();
    expect(screen.queryByRole("button", { name: /send|scan|research/i })).toBeNull();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    assertDossier("security");
  });

  it("swaps the entire dossier atomically, including dates, evidence and uncertainty", () => {
    render(<ProductDemo />);
    let previous = assertDossier("security");
    for (const audience of ["revenue", "agency", "security"] as const) {
      const option = DEMO_AUDIENCES.find((entry) => entry.id === audience)!;
      fireEvent.click(screen.getByRole("radio", { name: option.label }));
      expect((screen.getByRole("radio", { name: option.label }) as HTMLInputElement).checked).toBe(true);
      expect(previous.isConnected).toBe(false);
      previous = assertDossier(audience);
      expect(screen.getAllByRole("article")).toHaveLength(1);
      expect(screen.getByRole("status").textContent).toContain(`${option.label} sample selected`);
      expect(screen.getByRole("status").textContent).toContain("updated together");
      for (const other of Object.values(SAMPLE_DOSSIERS).filter((entry) => entry.audience !== audience)) {
        expect(screen.queryByText(other.company.name)).toBeNull();
        expect(screen.queryByText(other.contact.email)).toBeNull();
        expect(screen.queryByText(other.signal.title)).toBeNull();
        expect(screen.queryByText(other.draft.subject)).toBeNull();
        expect(screen.queryByText(other.uncertainty)).toBeNull();
        expect(screen.queryByText(other.evidence[0].sourceUrl)).toBeNull();
      }
    }
  });

  it("uses native, focusable evidence disclosure and resets it on audience change", () => {
    const { container } = render(<ProductDemo />);
    const details = container.querySelector("details")!;
    const summary = details.querySelector("summary")!;
    expect(summary.textContent).toContain("Inspect sample evidence");
    expect(details.open).toBe(false);
    summary.focus();
    expect(document.activeElement).toBe(summary);
    fireEvent.click(summary);
    expect(details.open).toBe(true);
    expect(within(details).getByText(/Illustrative excerpts, not fetched pages/)).toBeTruthy();
    expect(details.querySelectorAll("blockquote")).toHaveLength(2);
    expect(details.querySelectorAll("a")).toHaveLength(0);
    fireEvent.click(screen.getByRole("radio", { name: "Agency" }));
    const nextDetails = container.querySelector("details")!;
    expect(nextDetails).not.toBe(details);
    expect(nextDetails.open).toBe(false);
    expect(nextDetails.textContent).not.toContain("northline.example");
    expect(nextDetails.textContent).toContain("asterfield.example");
  });

  it("keeps audience controls mounted and focus intact while content changes", () => {
    render(<ProductDemo />);
    const revenue = screen.getByRole("radio", { name: "Revenue" });
    revenue.focus();
    fireEvent.click(revenue);
    expect(document.activeElement).toBe(revenue);
    expect(screen.getByRole("radio", { name: "Revenue" })).toBe(revenue);
    assertDossier("revenue");
  });

  it("never fetches, opens a connection, sends a beacon or submits outreach", async () => {
    const xhrOpen = vi.spyOn(XMLHttpRequest.prototype, "open").mockImplementation(() => undefined);
    const xhrSend = vi.spyOn(XMLHttpRequest.prototype, "send").mockImplementation(() => undefined);
    const { container } = render(<ProductDemo />);
    for (const { label } of DEMO_AUDIENCES) {
      fireEvent.click(screen.getByRole("radio", { name: label }));
      fireEvent.click(container.querySelector("summary")!);
      fireEvent.click(container.querySelector("summary")!);
    }
    await act(async () => { await Promise.resolve(); });
    expect(network.fetch).not.toHaveBeenCalled();
    expect(xhrOpen).not.toHaveBeenCalled();
    expect(xhrSend).not.toHaveBeenCalled();
    expect(network.websocket).not.toHaveBeenCalled();
    expect(network.eventSource).not.toHaveBeenCalled();
    expect(network.beacon).not.toHaveBeenCalled();
    expect(container.querySelectorAll("form, button[type='submit'], a[href^='mailto:']")).toHaveLength(0);
    const source = readFileSync(resolve(__dirname, "product-demo.tsx"), "utf8");
    const imports = Array.from(source.matchAll(/\bfrom\s+["']([^"']+)["']/g), (match) => match[1]);
    expect(imports).toEqual(expect.arrayContaining(["react", "motion/react", "./landing-data"]));
      expect(
      imports.every((path) =>
        ["lucide-react", "motion/react", "react", "./landing-data", "./demo-styles.module.css", "./spotlight"].includes(path),
      ),
    ).toBe(true);
    expect(source).not.toMatch(/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\s*\(/);
    expect(source).not.toMatch(/\bonSubmit\s*=|\bapi\.|\b(?:send|queue|scan)\s*\(/);
  });

  it("server-renders useful sample information without an entrance animation", () => {
    const html = renderToString(<ProductDemo />);
    expect(html).toContain('id="demo"');
    expect(html).toContain("Northline Systems");
    expect(html).toContain("Sample audience brief");
    expect(html).toContain("Sample signal");
    expect(html).toContain("Sample draft");
    expect(html).toContain("Inspect sample evidence");
    expect(html).toContain(SAMPLE_DISCLOSURE);
    expect(html).not.toMatch(/opacity:\s*0(?:[;"\s]|\.72)/);
  });

  it("renders separate native radio groups when embedded more than once", () => {
    render(<><ProductDemo /><ProductDemo /></>);
    const groups = screen.getAllByRole("group", { name: "Choose an audience" });
    const first = within(groups[0]).getByRole("radio", { name: "Revenue" }) as HTMLInputElement;
    const second = within(groups[1]).getByRole("radio", { name: "Security" }) as HTMLInputElement;
    expect(first.name).not.toBe(second.name);
    fireEvent.click(first);
    expect(first.checked).toBe(true);
    expect(second.checked).toBe(true);
  });
});
