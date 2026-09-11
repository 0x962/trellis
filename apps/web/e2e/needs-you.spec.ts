import { expect, test } from "@playwright/test";
import { get, put } from "./api";
import { createTicket, ensureProject, trellis } from "./cli";
import { failingPrUrl } from "./ghReplies";
import { signIn } from "./support";

// Both tests change the server settings, and every spec shares one server.
// Each test puts back the settings it found, so a later spec starts from them.
let before: unknown;
test.beforeEach(async () => {
	before = await get("/settings");
});
test.afterEach(async () => {
	await put("/settings", before);
});

// NYO-1 links a pull request with a failed check.
test.beforeAll(() => {
	if (!ensureProject("NYO", "Needs you")) return;
	createTicket("NYO", "Fix the desktop typecheck", ["--status", "in-progress"]);
	trellis(["pr", "add", "NYO-1", failingPrUrl]);
});

test("needs-you > failed checks leave the page empty", async ({ page }) => {
	await signIn(page, "/needs-you");
	const row = page.locator('[data-inbox-row="NYO-1"]');
	await expect(page.getByRole("heading", { name: "Needs you", exact: true })).toBeVisible();
	await expect(row).toHaveCount(0);
});

// E2E-04. The settings live on the server, so a reload shows them again.
// The gh stub answers `gh auth status` as signed out.
test("needs-you > settings persist across a reload and the gh banner matches the stub", async ({ page }) => {
	await signIn(page, "/settings");
	const name = page.getByRole("textbox", { name: /your name/i });
	await name.fill("Nav");
	const saved = page.waitForResponse(
		(response) => response.url().includes("settings/set") && (response.request().postData() ?? "").includes("Nav"),
	);
	await page.keyboard.press("Tab");
	await saved;
	await page.reload();
	await expect(page.getByRole("textbox", { name: /your name/i })).toHaveValue("Nav");
	// The name sits on Account and the gh banner on Integrations, so the
	// section navigation carries the page from the one to the other.
	await page.getByRole("navigation", { name: "Settings" }).getByRole("link", { name: "Integrations" }).click();
	const banner = page.getByRole("alert");
	await expect(banner).toContainText("gh is not signed in");
	// gh's own message names the command too, so the check finds the chip.
	await expect(page.getByText("gh auth login", { exact: true })).toBeVisible();
});
