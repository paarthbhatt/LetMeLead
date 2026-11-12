import { expect, test } from "@playwright/test";

// A brand-new workspace, so this journey never touches the seeded demo tenant.
test.use({ storageState: { cookies: [], origins: [] } });

test("a new workspace completes onboarding and lands on the overview", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("Work email").fill(`e2e-${Date.now()}@example.com`);
  await page.getByLabel("Password", { exact: true }).fill("e2e-password-123");
  await page.getByRole("button", { name: "Create workspace" }).click();

  await expect(page).toHaveURL(/\/onboarding$/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Set up your buyers" })).toBeVisible();

  await page.getByLabel("What do you sell?").fill(
    "Managed SOC 2 readiness and continuous compliance monitoring for B2B SaaS engineering teams.",
  );
  await page.getByLabel("Buyer personas").fill("CTO, VP Engineering, Head of Compliance");
  await page.getByLabel("Companies to add").fill("Northline Security,northline.example,US");

  await page.getByRole("button", { name: "Save and continue" }).click();

  await expect(page).toHaveURL(/\/overview$/, { timeout: 30_000 });
});
