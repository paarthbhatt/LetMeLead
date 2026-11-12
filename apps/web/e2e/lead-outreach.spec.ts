import { expect, test } from "@playwright/test";

test("claims a lead with credits from the leads page", async ({ page }) => {
  await page.goto("/leads");

  const claim = page.getByRole("button", { name: "Claim", exact: true }).first();
  await expect(claim).toBeVisible({ timeout: 30_000 });
  await claim.click();

  const dialog = page.getByRole("dialog", { name: "Claim this lead" });
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole("button", { name: /^(Confirm free claim|Claim · \d+ credits?)$/ })
    .click();

  await expect(
    page.getByRole("status").filter({ hasText: /^Claimed / }),
  ).toBeVisible({ timeout: 30_000 });
});

test("creates a campaign, starts it, then pauses it", async ({ page }) => {
  const name = `E2E campaign ${Date.now()}`;

  await page.goto("/campaigns");
  await page.getByRole("button", { name: "New campaign" }).click();
  await page.getByLabel("Campaign name").fill(name);
  await page.getByRole("button", { name: "Create draft" }).click();

  await expect(
    page.getByRole("status").filter({ hasText: /Draft created/ }),
  ).toBeVisible();

  await page.getByRole("link", { name, exact: true }).click();
  await expect(page).toHaveURL(/\/campaigns\/[0-9a-f-]+$/);

  await page.getByRole("button", { name: "Start campaign", exact: true }).click();
  const confirm = page.getByRole("dialog", { name: "Start this campaign?" });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("checkbox").check();
  await confirm.getByRole("button", { name: "Start campaign" }).click();

  const pause = page.getByRole("button", { name: "Pause", exact: true });
  await expect(pause).toBeVisible({ timeout: 30_000 });
  await pause.click();

  await expect(
    page.getByRole("button", { name: "Resume campaign" }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByRole("status").filter({ hasText: /Campaign paused/ }),
  ).toBeVisible();
});
