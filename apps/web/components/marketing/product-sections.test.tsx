import { fireEvent, render, screen, within } from "@testing-library/react";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MktFooter, MktHeader } from "./mkt-chrome";
import { FAQ_ITEMS, SIGNAL_CATEGORIES, ProductSections } from "./product-sections";

const PUBLISHED_ROUTES = new Set([
  "/how-it-works",
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
  it("renders the four-stage workflow with benefit-led headings", () => {
    render(<ProductSections />);

    const workflow = screen.getByRole("region", { name: "See the reason. Keep the decision." });
    expect(workflow.id).toBe("how-it-works");
    for (const heading of [
      "Evidence, not a list of strangers.",
      "A reason beats a filter.",
      "The receipt comes before the lead.",
      "Nothing leaves without you.",
    ]) {
      expect(screen.getByRole("heading", { name: heading })).toBeTruthy();
    }
  });

  it("answers the money and control questions in plain numbers", () => {
    const { container } = render(<ProductSections />);
    const text = container.textContent ?? "";

    expect(text).toMatch(/10 free claims/);
    expect(text).toMatch(/100 credits are \$49/);
    expect(text).toMatch(/one credit per claimed lead/);
    expect(text).toMatch(/No invented names, emails, companies or results/i);
  });

  it("keeps the evidence categories qualitative rather than inventory-like", () => {
    const { container } = render(<ProductSections />);
    const grid = container.querySelector<HTMLElement>('[aria-label="Signal categories"]');

    expect(SIGNAL_CATEGORIES).toHaveLength(8);
    expect(grid).toBeTruthy();
    for (const category of SIGNAL_CATEGORIES) {
      expect(within(grid!).getByText(category.name)).toBeTruthy();
      expect(within(grid!).getByText(category.blurb)).toBeTruthy();
    }
  });

  it("renders all FAQ items as native details and opens on summary activation", () => {
    const { container } = render(<ProductSections />);
    const details = Array.from(container.querySelectorAll("details"));
    const summaries = Array.from(container.querySelectorAll("summary"));

    expect(FAQ_ITEMS).toHaveLength(8);
    expect(details).toHaveLength(8);
    expect(summaries).toHaveLength(8);
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
      const inPage = href.startsWith("#");
      expect(inPage || PUBLISHED_ROUTES.has(href), `${href} is not a published target`).toBe(true);
    }
    expect(hrefs).toContain("/how-it-works");
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
      const inPage = href === "/" || href.startsWith("/#");
      expect(inPage || PUBLISHED_ROUTES.has(href), `${href} is not a published target`).toBe(true);
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
    expect(container.querySelectorAll("img, picture, blockquote")).toHaveLength(0);
    // The one figure on the page is our own pipeline drawing, not stock imagery.
    expect(container.querySelectorAll("figure")).toHaveLength(1);
  });

  it("keeps the implementation recipe off the public page", () => {
    const { container } = render(<ProductSections />);
    const text = container.textContent ?? "";

    for (const leak of [
      /bearer/i,
      /api[_ ]key/i,
      /env(ironment)? var/i,
      /playwright/i,
      /append-only/i,
      /adapter/i,
      /glsl|webgl|shader/i,
      /localhost/i,
      /heuristic/i,
      /mcp endpoint/i,
      /_TOKEN|_KEY\b/,
    ]) {
      expect(text, `public copy leaked ${leak}`).not.toMatch(leak);
    }
  });

  it("server-renders the information without a client-only shell", () => {
    const html = renderToString(<ProductSections />);

    expect(html).toContain("See the reason. Keep the decision.");
    expect(html).toContain("The signals most teams find three weeks late.");
    expect(html).toContain("Get 10 free leads");
    expect(html).toContain("Public moments");
    expect(html).toContain("<details");
    expect(html).not.toMatch(/opacity:\s*0(?:[;"\s]|\.)/);
  });
});
