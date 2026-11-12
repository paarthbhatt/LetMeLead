import { fireEvent, render, screen, within } from "@testing-library/react";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MktFooter, MktHeader } from "./mkt-chrome";
import {
  FAQ_ITEMS,
  ProductSections,
  SIGNAL_CATEGORIES,
  SIGNAL_TOTALS,
  SOURCE_ADAPTERS,
} from "./product-sections";

const PUBLISHED_ROUTES = new Set([
  "/how-it-works",
  "/integrations",
  "/trust",
  "/signup",
  "/login",
  "/demo",
]);

function contentLinks(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLAnchorElement>("a[href]")).map(
    (link) => link.getAttribute("href") ?? "",
  );
}

describe("ProductSections", () => {
  it("renders the four-stage workflow with its real labels and limits", () => {
    render(<ProductSections />);

    const workflow = screen.getByRole("region", { name: "Four moves, in your order." });
    expect(workflow.id).toBe("how-it-works");
    for (const heading of [
      "Paste a website. Build a target list.",
      "Signals first. Audience fit second.",
      "A dossier you can disagree with.",
      "Your account. Your pacing. Your call.",
    ]) {
      expect(screen.getByRole("heading", { name: heading })).toBeTruthy();
    }

    expect(screen.getByText("51 in 8 categories")).toBeTruthy();
    expect(screen.getByText(/7 adapters/i)).toBeTruthy();
    expect(screen.getByText(/Nothing sends automatically/i)).toBeTruthy();
    expect(screen.getByText(/Scanning itself does not spend credits/i)).toBeTruthy();
    expect(screen.getByText(/Signals show timing, not intent/i)).toBeTruthy();
    expect(screen.getAllByText(/no staffed-research promise/i).length).toBeGreaterThan(0);
  });

  it("labels live, partly live and by-hand coverage without overstating it", () => {
    render(<ProductSections />);

    const table = screen.getByRole("table", { name: /The seven source adapters/i });
    expect(within(table).getAllByText("Live")).toHaveLength(2);
    expect(within(table).getAllByText("Partly live")).toHaveLength(5);
    expect(screen.getByText("By hand")).toBeTruthy();
    expect(screen.getAllByText(/means not automated/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/No fabricated data/i)).toBeTruthy();
    expect(screen.getByText(/Timing is not intent/i)).toBeTruthy();
    expect(screen.getByText(/LinkedIn automation carries platform risk/i)).toBeTruthy();
  });

  it("renders the real adapter list with its honest statuses and requirements", () => {
    render(<ProductSections />);

    expect(SOURCE_ADAPTERS).toHaveLength(7);
    for (const source of SOURCE_ADAPTERS) {
      expect(screen.getByRole("cell", { name: source.name })).toBeTruthy();
      expect(screen.getByText(source.needs)).toBeTruthy();
    }
    expect(screen.getByText("X_BEARER_TOKEN. Official API v2 only.")).toBeTruthy();
    expect(screen.getByText("REVIEWS_FEED_URL returning a JSON array.")).toBeTruthy();
  });

  it("renders all FAQ items as native details and opens on summary activation", () => {
    const { container } = render(<ProductSections />);
    const details = Array.from(container.querySelectorAll("details"));
    const summaries = Array.from(container.querySelectorAll("summary"));

    expect(FAQ_ITEMS).toHaveLength(8);
    expect(details).toHaveLength(8);
    expect(summaries).toHaveLength(8);
    expect(details.length).toBeGreaterThanOrEqual(6);
    expect(details.length).toBeLessThanOrEqual(8);
    for (const item of FAQ_ITEMS) {
      expect(screen.getByText(item.question)).toBeTruthy();
    }

    expect(details[0].open).toBe(false);
    fireEvent.click(summaries[0]);
    expect(details[0].open).toBe(true);
  });

  it("keeps every content link on a published route", () => {
    const { container } = render(<ProductSections />);
    const hrefs = contentLinks(container);

    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(PUBLISHED_ROUTES.has(href), `${href} is not one of the published routes`).toBe(true);
    }
    expect(hrefs).toContain("/how-it-works");
    expect(hrefs).toContain("/integrations");
    expect(hrefs).toContain("/trust");
    expect(hrefs).toContain("/signup");
  });

  it("keeps chrome links to the published routes plus the documented home back link", () => {
    const { container } = render(
      <>
        <MktHeader back />
        <MktFooter />
      </>,
    );
    const hrefs = contentLinks(container);

    expect(hrefs).toContain("/");
    for (const href of hrefs) {
      expect(href === "/" || PUBLISHED_ROUTES.has(href), `${href} is not a published target`).toBe(
        true,
      );
    }
  });

  it("contains no fabricated social proof, logos, counts or certifications", () => {
    const { container } = render(<ProductSections />);
    const text = container.textContent ?? "";

    expect(text).not.toMatch(/testimonial/i);
    expect(text).not.toMatch(/trusted by/i);
    expect(text).not.toMatch(/customers say|case study|logo wall/i);
    expect(text).not.toMatch(/award-winning|certified|industry leader/i);
    expect(text).not.toMatch(/\b\d{1,3}(,\d{3})+\s+(customers|teams|companies)\b/i);
    expect(container.querySelectorAll("img, picture, figure, blockquote")).toHaveLength(0);
  });

  it("keeps the counts internally consistent with the real catalog", () => {
    expect(SIGNAL_TOTALS.signals).toBe(51);
    expect(SIGNAL_TOTALS.categories).toBe(8);
    expect(SIGNAL_TOTALS.live + SIGNAL_TOTALS.partlyLive + SIGNAL_TOTALS.byHand).toBe(51);
    expect(SIGNAL_CATEGORIES).toHaveLength(8);
    expect(SIGNAL_CATEGORIES.reduce((total, category) => total + category.count, 0)).toBe(51);
  });

  it("server-renders the information without a client-only shell", () => {
    const html = renderToString(<ProductSections />);

    expect(html).toContain("Four moves, in your order.");
    expect(html).toContain("Seven adapters. Fifty-one signals. Honest labels.");
    expect(html).toContain("51 in 8 categories");
    expect(html).toContain("Nothing sends automatically");
    expect(html).toContain("Scanning itself does not spend credits");
    expect(html).toContain("localhost:8765/mcp");
    expect(html).toContain("<details");
    expect(html).not.toMatch(/opacity:\s*0(?:[;"\s]|\.)/);
  });
});
