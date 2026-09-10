import { expect, test } from "@playwright/test";
import { put } from "./api";

const signIn = async (page: import("@playwright/test").Page) => {
	await page.goto("/needs-you");
	const name = page.getByRole("textbox", { name: /name/i });
	await name.fill("navid");
	await name.press("Enter");
};

// E2E-03. The command is the deliverable: it names the ticket and the
// checks that failed.
test("needs-you > Re-run with agent copies the command with the check names", async ({ page, context }) => {
	await context.grantPermissions(["clipboard-read", "clipboard-write"]);
	await put("/settings", {
		defaultActorName: "navid",
		startWithAgentTemplate: 'claude "{brief}"',
		stalledHours: 24,
	});
	await signIn(page);
	await page.goto("/needs-you");
	const row = page.locator('[data-inbox-row="CDE-44"]');
	await row.locator("button[data-rerun]").click();
	const copied = await page.evaluate(() => navigator.clipboard.readText());
	expect(copied).toBe('claude "$(trellis brief CDE-44)" fix the failing checks: typecheck (desktop)');
});

// E2E-04. The settings live on the server, so a reload shows them again.
test("needs-you > settings persist across a reload and the gh banner matches the stub", async ({ page }) => {
	await signIn(page);
	await page.goto("/settings");
	const name = page.getByRole("textbox", { name: /your name/i });
	await name.fill("Nav");
	const template = page.getByRole("textbox", { name: /start with agent/i });
	await template.fill('codex exec "{brief}"');
	await page.getByRole("button", { name: "Save" }).click();
	await page.reload();
	await expect(page.getByRole("textbox", { name: /your name/i })).toHaveValue("Nav");
	await expect(page.getByRole("textbox", { name: /start with agent/i })).toHaveValue('codex exec "{brief}"');
	const banner = page.getByRole("alert");
	await expect(banner).toContainText("gh is not signed in");
	await expect(page.getByText("gh auth login")).toBeVisible();
});
