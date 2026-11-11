import { test, expect } from "@playwright/test";
import { test as ownerTest } from "./fixtures";
import AxeBuilder from "@axe-core/playwright";

test("P1-S04A public preview and login entry expose no private data", async ({
  page,
}) => {
  const result = await page.goto("/");
  expect(result?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "A clearer view of your money.",
  );
  await expect(
    page.getByText("This public preview contains no personal financial data."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sign out", exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
  await page
    .getByRole("navigation", { name: "Public navigation" })
    .getByRole("link", { name: "Sign in", exact: true })
    .click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByRole("link", { name: "Back to public dashboard" }).click();
  await expect(page).toHaveURL("/");
  expect((await page.request.get("/api/workspaces")).status()).toBe(401);
  await page.goto("/home");
  await expect(page).toHaveURL(/\/login$/);
});
for (const theme of ["light", "dark"] as const)
  test(`P1-S04A public ${theme} accessibility and mobile reflow`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.goto("/");
    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze()
        ).violations,
      ).toEqual([]);
    }
    await page.screenshot({
      path: testInfo.outputPath(`public-${theme}.png`),
      fullPage: true,
      animations: "disabled",
    });
  });
ownerTest(
  "P1-S04A existing owner transitions from public login to protected home",
  async ({ page }) => {
    await page.goto("/");
    await page
      .getByRole("navigation", { name: "Public navigation" })
      .getByRole("link", { name: "Sign in", exact: true })
      .click();
    await expect(page).toHaveURL("/home");
    await expect(
      page.getByRole("heading", { name: "Your money. A little clearer." }),
    ).toBeVisible();
  },
);
