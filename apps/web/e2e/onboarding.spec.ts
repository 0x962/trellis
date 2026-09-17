import { expect, type Page, test } from "@playwright/test";
import { get } from "./api";
import { signIn } from "./support";

// This file runs first, against a server with no project and a browser with
// no stored actor.

// The init script runs before any page script. It records the theme the
// document carries when the parser finishes, which is what the first paint
// uses.
const captureTheme = `document.addEventListener("DOMContentLoaded", () => {
	window.__themeAtLoad = document.documentElement.getAttribute("data-theme");
});`;

const installDesktopBridge = (page: Page) =>
	page.addInitScript(() => {
		Object.defineProperty(window, "trellisDesktop", {
			value: {
				platform: "darwin",
				chooseDirectory: async () => null,
				status: async () => ({ packaged: true, dataDirectory: "/Users/dana/.trellis", openAtLogin: false }),
				serviceStatus: async () => "enabled",
				updateStatus: async () => null,
				setOpenAtLogin: async () => {},
				run: async () => {},
			},
		});
	});

// WS-142
test("first run paints dark and lands on setup", async ({ page }) => {
	await page.addInitScript(captureTheme);
	await page.goto("/");
	await expect(page).toHaveURL(/\/setup$/);
	const theme = await page.evaluate(() => (window as unknown as { __themeAtLoad: string | null }).__themeAtLoad);
	expect(theme).toBe("dark");
});

test("desktop settings open before the first project exists", async ({ page }) => {
	await installDesktopBridge(page);
	await page.goto("/settings#desktop");
	await expect(page).toHaveURL(/\/settings#desktop$/);
	const section = page.getByRole("region", { name: "Desktop" });
	await expect(section).toBeVisible();
	await expect(section.getByRole("button", { name: "Choose data directory", exact: true })).toBeEnabled();
});

// WS-143. The name step stores the actor; the project step creates the
// first project on the server and lands on its table.
test("setup creates the actor and the first project", async ({ page }) => {
	await page.goto("/setup");
	const name = page.getByRole("textbox", { name: /name/i });
	await name.fill("dana");
	await name.press("Enter");
	await expect(page.getByRole("heading", { name: "Create your first project" })).toBeVisible();
	const actor = await page.evaluate(() => localStorage.getItem("trellis.actor"));
	expect(JSON.parse(actor!)).toEqual({ name: "dana", kind: "human" });
	// One word suggests its first two letters (WS-74 in src/lib/projectKey).
	await page.getByRole("textbox", { name: /project name/i }).fill("Docs");
	await expect(page.getByRole("textbox", { name: /key/i })).toHaveValue("DO");
	await page.getByRole("button", { name: "Create" }).click();
	await expect(page).toHaveURL(/\/p\/DO$/);
	const sidebar = page.getByRole("complementary", { name: "Sidebar" });
	const docRow = sidebar.locator('[data-slot="label"]').filter({ hasText: /^Docs$/ });
	await expect(docRow).toBeVisible();
	await expect(sidebar).toContainText("dana");
	const projects = await get<{ key: string; name: string }[]>("/projects");
	expect(projects.map((project) => [project.key, project.name])).toEqual([["DO", "Docs"]]);
});

// WS-144
test("sidebar collapse persists and g h navigates", async ({ page }) => {
	await signIn(page, "/all");
	const sidebar = page.getByRole("complementary", { name: "Sidebar" });
	await expect(sidebar).toBeVisible();
	await page.keyboard.press("[");
	await expect(sidebar).toHaveAttribute("data-collapsed", "true");
	await page.reload();
	await expect(page.getByRole("heading", { name: "All tickets" })).toBeVisible();
	await expect(sidebar).toHaveAttribute("data-collapsed", "true");
	await expect(sidebar.getByRole("button", { name: "Expand sidebar" })).toBeVisible();
	await page.keyboard.press("g");
	await page.keyboard.press("h");
	await expect(page).toHaveURL(/\/needs-you$/);
});
