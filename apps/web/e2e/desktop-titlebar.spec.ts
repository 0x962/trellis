import { expect, test } from "@playwright/test";
import { post } from "./api";
import { signIn } from "./support";

test.beforeAll(async () => {
	await post("/projects", { name: "Desktop title tests", key: "TITLE" });
});

test("the macOS title strip clears all sidebar states and preserves page actions", async ({ page }) => {
	await page.setViewportSize({ width: 900, height: 650 });
	await page.addInitScript(() => Object.defineProperty(window, "trellisDesktop", { value: { platform: "darwin" } }));
	await signIn(page, "/all");
	const title = page.locator("[data-desktop-titlebar]");
	await expect(title).toBeVisible();
	expect(await title.evaluate((element) => getComputedStyle(element).getPropertyValue("app-region"))).toBe("drag");
	const content = page.locator("[data-desktop-content]");
	expect(await content.evaluate((element) => getComputedStyle(element).getPropertyValue("app-region"))).toBe("no-drag");
	const sidebar = page.getByRole("complementary", { name: "Sidebar" });
	const top = await title.boundingBox();
	expect(top!.height).toBe(40);
	expect((await sidebar.boundingBox())!.y).toBeGreaterThanOrEqual(top!.y + top!.height);
	await page.getByRole("button", { name: "Collapse sidebar", exact: true }).click();
	await expect(sidebar).toHaveAttribute("data-collapsed", "true");
	expect((await sidebar.boundingBox())!.y).toBeGreaterThanOrEqual(40);
	await page.getByRole("button", { name: "Expand sidebar", exact: true }).click();
	await expect(sidebar).not.toHaveAttribute("data-collapsed");
	await page.getByRole("link", { name: /^Search/ }).click();
	await expect(page).toHaveURL(/\/search/);
	await expect(title).toBeVisible();
});

test("a browser page has no desktop title strip or reserved space", async ({ page }) => {
	await signIn(page, "/all");
	await expect(page.locator("[data-desktop-titlebar]")).toHaveCount(0);
	expect((await page.getByRole("complementary", { name: "Sidebar" }).boundingBox())!.y).toBe(0);
});
