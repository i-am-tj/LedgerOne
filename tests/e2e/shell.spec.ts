import { expect, test } from "./fixtures";
import AxeBuilder from "@axe-core/playwright";

async function openNavigation(
  page: import("@playwright/test").Page,
  mobile: boolean,
) {
  if (mobile)
    await page.getByRole("button", { name: "Open navigation" }).click();
  return page
    .getByRole("navigation", { name: "Main navigation" })
    .filter({ visible: true });
}
test("P1-S02 routes, active navigation and mobile menu focus", async ({
  page,
  isMobile,
}) => {
  await page.goto("/home");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Your money. A little clearer.",
  );
  const nav = await openNavigation(page, isMobile);
  await expect(
    nav.getByRole("link", { name: "Overview", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  if (isMobile) {
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Open navigation" }),
    ).toBeFocused();
    await page.getByRole("button", { name: "Open navigation" }).click();
  }
  await nav.getByRole("link", { name: "Appearance", exact: true }).click();
  await expect(page).toHaveURL(/\/settings\/appearance$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const secondNav = await openNavigation(page, isMobile);
  await secondNav
    .getByRole("link", { name: "Component library", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Simple. Consistent. Considered." }),
  ).toBeVisible();
  if (isMobile) {
    await openNavigation(page, true);
    for (let i = 0; i < 9; i++) {
      await page.keyboard.press("Tab");
      expect(
        await page.evaluate(
          () => !!document.activeElement?.closest('[role="dialog"]'),
        ),
      ).toBe(true);
    }
    await page.keyboard.press("Escape");
  }
});
test("P1-S02 skip link and empty overview", async ({ page }) => {
  await page.goto("/home");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
  await expect(
    page.getByRole("heading", { name: "A home for every account" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Everyday moments, clearly recorded" }),
  ).toBeVisible();
});
test("P1-S02 light, dark and system theme persistence", async ({ page }) => {
  await page.goto("/settings/appearance");
  await page.getByRole("radio", { name: /^Dark/ }).check();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.getByRole("status")).toContainText("Dark theme selected");
  await page.reload();
  await expect(page.getByRole("radio", { name: /^Dark/ })).toBeChecked();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.getByRole("radio", { name: /^Light/ }).check();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await page.getByRole("radio", { name: /^System/ }).check();
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await page.getByRole("button", { name: "Toggle color theme" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
});
test("P1-S02 form validation, safe rendering and all feedback states", async ({
  page,
}) => {
  await page.goto("/design-system");
  await page.getByRole("button", { name: "Preview confirmation" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "Enter at least 2 characters.",
  );
  await expect(page.getByLabel("Preview label", { exact: true })).toBeFocused();
  await expect(
    page.getByLabel("Preview label", { exact: true }),
  ).toHaveAttribute("aria-invalid", "true");
  await page
    .getByLabel("Preview label", { exact: true })
    .fill("<b>A clear label</b>");
  await page.getByRole("button", { name: "Preview confirmation" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Preview accepted: <b>A clear label</b>. Nothing was saved.",
  );
  await page.getByLabel("Preview label", { exact: true }).fill("a".repeat(61));
  await page.getByRole("button", { name: "Preview confirmation" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "Use 60 characters or fewer.",
  );
  await page.getByRole("button", { name: "Loading", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Loading preview…");
  await page.getByRole("button", { name: "Error", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "The preview couldn’t load" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(
    page.getByRole("heading", { name: "Nothing here yet" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Success", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText(
    "You’re all set. This is a confirmation preview.",
  );
});
test("P1-S02 no dead links and useful not-found recovery", async ({ page }) => {
  for (const route of ["/home", "/settings/appearance", "/design-system"]) {
    await page.goto(route);
    const links = await page
      .locator('a[href^="/"]')
      .evaluateAll((elements) => [
        ...new Set(elements.map((element) => element.getAttribute("href"))),
      ]);
    for (const href of links)
      expect((await page.request.get(href!)).status(), href!).toBe(200);
  }
  await page.goto("/this-page-does-not-exist");
  await expect(
    page.getByRole("heading", { name: "This page isn’t here." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Back to overview" }).click();
  await expect(page).toHaveURL("/");
});
test("P1-S02 narrow width, zoom-equivalent reflow and reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [320, 768, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ["/home", "/settings/appearance", "/design-system"]) {
      await page.goto(route);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    }
  }
  await page.getByRole("button", { name: "Loading", exact: true }).click();
  await expect(page.locator(".loading-spinner")).toHaveCSS(
    "animation-name",
    "none",
  );
});
for (const theme of ["light", "dark"] as const) {
  test(`P1-S02 ${theme} accessibility and visual evidence`, async ({
    page,
    isMobile,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: theme });
    for (const route of ["/home", "/settings/appearance", "/design-system"]) {
      await page.goto(route);
      await expect(page.locator("html")).toHaveClass(new RegExp(theme));
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(results.violations).toEqual([]);
    }
    await page.goto("/home");
    await page.screenshot({
      path: testInfo.outputPath(`overview-${theme}.png`),
      fullPage: true,
      animations: "disabled",
    });
    if (isMobile) {
      await openNavigation(page, true);
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze()
        ).violations,
      ).toEqual([]);
    }
  });
}
