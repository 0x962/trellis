import { expect, test } from "@playwright/test";
import { post } from "./api";
import { signIn } from "./support";

test.beforeAll(async () => {
	await post("/projects", { name: "Desktop title tests", key: "TITLE" });
});

test("the desktop header reaches the top and clears native controls in every sidebar state", async ({ page }) => {
	await page.setViewportSize({ width: 900, height: 650 });
	await page.addInitScript(() => Object.defineProperty(window, "trellisDesktop", { value: { platform: "darwin" } }));
	await signIn(page, "/all");
	await expect(page.locator("[data-desktop-titlebar]")).toHaveCount(0);
	const header = page.getByRole("main").locator(":scope > header");
	await expect(header).toBeVisible();
	await expect.poll(async () => (await header.boundingBox())?.y).toBe(0);
	expect(await header.evaluate((element) => getComputedStyle(element).getPropertyValue("app-region"))).toBe("drag");
	const sidebar = page.getByRole("complementary", { name: "Sidebar" });
	expect((await sidebar.boundingBox())!.y).toBe(0);
	const collapse = page.getByRole("button", { name: "Collapse sidebar", exact: true });
	expect((await collapse.boundingBox())!.x).toBeGreaterThanOrEqual(96);
	expect(await collapse.evaluate((element) => getComputedStyle(element).getPropertyValue("app-region"))).toBe(
		"no-drag",
	);
	await collapse.click();
	await expect(sidebar).toHaveAttribute("data-collapsed", "true");
	const expand = page.getByRole("button", { name: "Expand sidebar", exact: true });
	await expect(expand).toBeVisible();
	expect((await expand.boundingBox())!.x).toBeGreaterThanOrEqual(96);
	expect((await header.boundingBox())!.y).toBe(0);
	await expand.click();
	await expect(sidebar).not.toHaveAttribute("data-collapsed");
	await page.getByRole("link", { name: /^Search/ }).click();
	await expect(page).toHaveURL(/\/search/);
	await expect(page.locator("[data-desktop-titlebar]")).toHaveCount(0);
	expect((await header.boundingBox())!.y).toBe(0);
});

test("a browser page has no desktop title strip or reserved space", async ({ page }) => {
	await signIn(page, "/all");
	await expect(page.locator("[data-desktop-titlebar]")).toHaveCount(0);
	expect((await page.getByRole("complementary", { name: "Sidebar" }).boundingBox())!.y).toBe(0);
});
