import { expect, type Page, test } from "@playwright/test";
import { createTicket, ensureProject } from "./cli";
import { rowOf, signIn } from "./support";

// CDE-1 is the first ticket of CDE, so `cde-1` in the palette names it.
test.beforeAll(() => {
	if (!ensureProject("CDE", "Code")) return;
	createTicket("CDE", "Restore the fork pages after the upstream 1.27 merge");
	createTicket("CDE", "Merge upstream 1.27 and keep every marked site");
});

const palette = (page: Page) => page.getByRole("dialog", { name: "Command palette" });

const openPalette = async (page: Page) => {
	await page.keyboard.press("ControlOrMeta+k");
	await expect(palette(page)).toBeVisible();
	return palette(page).getByRole("combobox");
};

// The palette field takes the focus some frames after Cmd+K. Keys typed at
// once go into the query, and the `o` of the query opens no ticket.
test("keys typed at once after Cmd+K fill the query and open no ticket", async ({ page }) => {
	await signIn(page, "/p/CDE");
	await expect(rowOf(page, "CDE-1")).toBeVisible();
	await page.keyboard.press("j");
	await page.keyboard.press("ControlOrMeta+k");
	await page.keyboard.type("oauth");
	await expect(palette(page).getByRole("combobox")).toHaveValue("oauth");
	await expect(page).toHaveURL(/\/p\/CDE$/);
});

// E2E-04. Cmd+K, the identifier, Enter: the ticket page opens.
test("typing an identifier jumps to that ticket", async ({ page }) => {
	await signIn(page, "/p/CDE");
	await expect(rowOf(page, "CDE-1")).toBeVisible();
	const input = await openPalette(page);
	await input.fill("cde-1");
	await expect(palette(page).getByRole("option").first()).toContainText(/CDE-1/);
	await page.keyboard.press("Enter");
	await expect(page).toHaveURL(/\/t\/CDE-1$/);
});

// E2E-01. `pags` is no prefix of `pages`, so the text search path finds
// nothing and only the trigram path, one similar title word per typed word,
// finds the ticket.
test("a typo in the palette finds the ticket and opens the peek", async ({ page }) => {
	await signIn(page, "/p/CDE");
	await expect(rowOf(page, "CDE-1")).toBeVisible();
	const input = await openPalette(page);
	await input.fill("restor the fork pags");
	await expect(palette(page).getByRole("option", { name: /Restore the fork pages/ })).toBeVisible();
	await page.keyboard.press("Enter");
	await expect(page).toHaveURL(/peek=CDE-1(&|$)/);
});

// E2E-02. CDE-2 starts in Todo; the palette moves it to In Progress and the
// row shows the new status in place.
test("Change status from the palette updates the row in place", async ({ page }) => {
	await signIn(page, "/p/CDE");
	const row = rowOf(page, "CDE-2");
	await row.getByText("Merge upstream 1.27", { exact: false }).click();
	const input = await openPalette(page);
	await input.fill("Change status");
	await palette(page)
		.getByRole("option", { name: /Change status/ })
		.click();
	await palette(page)
		.getByRole("option", { name: /In Progress/ })
		.click();
	await expect(palette(page)).toBeHidden();
	await expect(row).toContainText("In Progress");
});

// E2E-03
test("g then h shows the hint and lands on Needs you", async ({ page }) => {
	await signIn(page, "/all");
	await expect(page.getByRole("heading", { name: "All tickets" })).toBeVisible();
	await page.keyboard.press("g");
	await expect(page.getByRole("status").filter({ hasText: "g" }).first()).toBeVisible();
	await page.keyboard.press("h");
	await expect(page).toHaveURL(/\/needs-you$/);
});

// E2E-05
test("the help sheet opens over any route and closes on Escape", async ({ page }) => {
	await signIn(page, "/all");
	await expect(page.getByRole("heading", { name: "All tickets" })).toBeVisible();
	await page.keyboard.press("?");
	const sheet = page.getByRole("dialog", { name: /Keyboard shortcuts/ });
	await expect(sheet).toBeVisible();
	// The map holds 42 rows. Three actions have two keys each and print as
	// one row, so the sheet shows 39.
	await expect(sheet.getByRole("listitem")).toHaveCount(39);
	await page.keyboard.press("Escape");
	await expect(sheet).toBeHidden();
});
