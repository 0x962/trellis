import { expect, test } from "@playwright/test";
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

// WS-142
test("first run paints dark and lands on setup", async ({ page }) => {
	await page.addInitScript(captureTheme);
	await page.goto("/");
	await expect(page).toHaveURL(/\/setup$/);
	const theme = await page.evaluate(() => (window as unknown as { __themeAtLoad: string | null }).__themeAtLoad);
	expect(theme).toBe("dark");
});

// WS-143. The name step stores the actor; the project step creates the
// first project on the server and lands on its table.
test("setup creates the actor and the first project", async ({ page }) => {
	await page.goto("/setup");
	const name = page.getByRole("textbox", { name: /name/i });
	await name.fill("navid");
	await name.press("Enter");
	await expect(page.getByRole("heading", { name: "Create your first project" })).toBeVisible();
	const actor = await page.evaluate(() => localStorage.getItem("trellis.actor"));
	expect(JSON.parse(actor!)).toEqual({ name: "navid", kind: "human" });
	// One word suggests its first two letters (WS-74 in src/lib/projectKey).
	await page.getByRole("textbox", { name: /project name/i }).fill("Docs");
	await expect(page.getByRole("textbox", { name: /key/i })).toHaveValue("DO");
	await page.getByRole("button", { name: "Create" }).click();
	await expect(page).toHaveURL(/\/p\/DO$/);
	const sidebar = page.getByRole("complementary", { name: "Sidebar" });
	const docRow = sidebar.getByRole("link", { name: /Docs/ });
	await expect(docRow).toBeVisible();
	await expect(sidebar).toContainText("navid");
	const projects = await get<{ key: string; name: string }[]>("/projects");
	expect(projects.map((project) => [project.key, project.name])).toEqual([["DO", "Docs"]]);
});

// WS-144
test("sidebar collapse persists and g h navigates", async ({ page }) => {
	await signIn(page, "/all");
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
