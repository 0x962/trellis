import { expect, test } from "@playwright/test";

// The init script runs before any page script. It records the theme the
// document carries when the parser finishes, which is what the first paint
// uses.
const captureTheme = `document.addEventListener("DOMContentLoaded", () => {
	window.__themeAtLoad = document.documentElement.getAttribute("data-theme");
});`;

// WS-142
test("first run paints dark and lands on setup", async ({ page }) => {
	await page.addInitScript(captureTheme);
	await page.goto("/");
	await expect(page).toHaveURL(/\/setup$/);
	const theme = await page.evaluate(() => (window as unknown as { __themeAtLoad: string | null }).__themeAtLoad);
	expect(theme).toBe("dark");
});

// WS-143
test("setup creates the first project and shows it in the sidebar", async ({ page }) => {
	await page.goto("/setup");
	const name = page.getByRole("textbox", { name: /name/i });
	await name.fill("navid");
	await name.press("Enter");
	await page.getByRole("textbox", { name: /project name/i }).fill("Docs");
	await expect(page.getByRole("textbox", { name: /key/i })).toHaveValue("DOC");
	await page.getByRole("button", { name: "Create" }).click();
	await expect(page).toHaveURL(/\/p\/DOC$/);
	const sidebar = page.getByRole("complementary", { name: "Sidebar" });
	const docRow = sidebar.getByRole("link", { name: /Docs/ });
	await expect(docRow).toBeVisible();
	await expect(docRow).toContainText("0");
	await expect(sidebar).toContainText("navid");
});

// WS-144. The project from the previous spec exists on the shared fake
// server, so a fresh context needs only the name step.
test("sidebar collapse persists and g h navigates", async ({ page }) => {
	await page.goto("/all");
	const name = page.getByRole("textbox", { name: /name/i });
	await name.fill("navid");
	await name.press("Enter");
	await page.goto("/all");
	const sidebar = page.getByRole("complementary", { name: "Sidebar" });
	await expect(sidebar).toBeVisible();
	await page.keyboard.press("[");
	await expect(sidebar).toBeHidden();
	await page.reload();
	await expect(page.getByRole("heading", { name: "All tickets" })).toBeVisible();
	await expect(sidebar).toBeHidden();
	await page.keyboard.press("g");
	await page.keyboard.press("h");
	await expect(page).toHaveURL(/\/needs-you$/);
});
