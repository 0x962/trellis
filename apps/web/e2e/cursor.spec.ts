import { expect, type Locator, test } from "@playwright/test";
import { createTicket, ensureProject } from "./cli";
import { signIn } from "./support";

// T6. Tailwind's preflight gives a button `cursor: default`, so every
// control that opens or runs something needs the base rule in
// packages/ui/src/base.css. The check reads the computed cursor in a real
// browser, where the cascade layers apply.
test.beforeAll(() => {
	if (!ensureProject("CUR", "Cursor")) return;
	createTicket("CUR", "A card to hover");
});

const cursor = (locator: Locator) => locator.evaluate((element) => getComputedStyle(element).cursor);

test("a sidebar project row and a menu item show the pointer", async ({ page }) => {
	await signIn(page, "/all");
	const tree = page.getByRole("navigation", { name: "Projects" });
	const row = tree.getByRole("link", { name: /Cursor/ });
	await expect(row).toBeVisible();
	expect(await cursor(row)).toBe("pointer");
	await row.hover();
	const actions = tree.getByRole("button", { name: "Actions for Cursor" });
	await actions.click();
	const item = page.getByRole("menuitem", { name: "Settings" });
	await expect(item).toBeVisible();
	expect(await cursor(item)).toBe("pointer");
});

test("a board card shows the grab hand", async ({ page }) => {
	await signIn(page, "/p/CUR/board");
	const card = page.locator("[data-card]").first();
	await expect(card).toBeVisible();
	expect(await cursor(card)).toBe("grab");
});
