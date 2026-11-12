import { expect, test as setup } from "@playwright/test";

const authFile = "e2e/.auth/demo.json";
const email = process.env.E2E_EMAIL ?? "demo@letmelead.dev";
const password = process.env.E2E_PASSWORD ?? "demo-password-123";

/**
 * Signs in through the real login form once and reuses that session, so the
 * journey tests exercise the app rather than a hand-built token.
 */
setup("sign in as the seeded demo owner", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/overview$/, { timeout: 30_000 });
  await page.context().storageState({ path: authFile });
});
