import { expect, type Page, test } from "@playwright/test";

// Every spec starts with an empty localStorage, so the app asks for a name
// first.
const signIn = async (page: Page, path: string) => {
	await page.goto(path);
	const name = page.getByRole("textbox", { name: /name/i });
	if (await name.isVisible()) {
		await name.fill("navid");
		await name.press("Enter");
		await page.goto(path);
	}
};

const palette = (page: Page) => page.getByRole("dialog", { name: "Command menu" });

const openPalette = async (page: Page) => {
	await page.keyboard.press("ControlOrMeta+k");
	await expect(palette(page)).toBeVisible();
	return palette(page).getByRole("combobox");
};

// E2E-01
test("a typo in the palette finds the ticket and opens the peek", async ({ page }) => {
	await signIn(page, "/p/CDE");
	const input = await openPalette(page);
	await input.fill("restor teh fork");
	await expect(palette(page).getByRole("option", { name: /Restore the fork pages/ })).toBeVisible();
	await page.keyboard.press("Enter");
	await expect(page).toHaveURL(/peek=CDE-42/);
});

// E2E-02. The seed already holds CDE-42 in Human Review, so the spec moves
// it to In Progress and reads the row back.
test("Change status from the palette updates the row in place", async ({ page }) => {
	await signIn(page, "/p/CDE");
	const row = page.getByRole("row", { name: /CDE-42/ });
	await row.click();
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
	await page.keyboard.press("g");
	await expect(page.getByRole("status").filter({ hasText: "g" }).first()).toBeVisible();
	await page.keyboard.press("h");
	await expect(page).toHaveURL(/\/needs-you$/);
});

// E2E-04
test("typing an identifier jumps to that ticket", async ({ page }) => {
	await signIn(page, "/p/CDE");
	const input = await openPalette(page);
	await input.fill("cde-1");
	await expect(palette(page).getByRole("option").first()).toContainText(/CDE-1/);
	await page.keyboard.press("Enter");
	await expect(page).toHaveURL(/\/t\/CDE-1$/);
});

// E2E-05
test("the help sheet opens over any route and closes on Escape", async ({ page }) => {
	await signIn(page, "/all");
	await page.keyboard.press("?");
	const sheet = page.getByRole("dialog", { name: /Keyboard shortcuts/ });
	await expect(sheet).toBeVisible();
	await expect(sheet.getByRole("listitem")).toHaveCount(42);
	await page.keyboard.press("Escape");
	await expect(sheet).toBeHidden();
});
