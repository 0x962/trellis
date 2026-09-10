import { expect, test } from "@playwright/test";
import { put } from "./api";
import { createTicket, ensureProject, trellis } from "./cli";
import { failingPrUrl } from "./ghReplies";
import { signIn } from "./support";

// NYO-1 links the stubbed pull request, whose `typecheck (desktop)` check
// fails, so the ticket shows in the Failing CI section.
test.beforeAll(() => {
	if (!ensureProject("NYO", "Needs you")) return;
	createTicket("NYO", "Fix the desktop typecheck", ["--status", "in-progress"]);
	trellis(["pr", "add", "NYO-1", failingPrUrl]);
});

// E2E-03. The command is the deliverable: it names the ticket and the
// checks that failed.
test("needs-you > Re-run with agent copies the command with the check names", async ({ page, context }) => {
	await context.grantPermissions(["clipboard-read", "clipboard-write"]);
	await put("/settings", {
		defaultActorName: "navid",
		startWithAgentTemplate: 'claude "{brief}"',
		stalledHours: 24,
	});
	await signIn(page, "/needs-you");
	const row = page.locator('[data-inbox-row="NYO-1"]');
	await row.locator("button[data-rerun]").click();
	const copied = await page.evaluate(() => navigator.clipboard.readText());
	// buildAgentCommand is the one builder: `{brief}` becomes the ID, and the
	// failed check names go inside the quoted brief.
	expect(copied).toBe('claude "NYO-1 Fix the failed checks: typecheck (desktop)."');
});

// E2E-04. The settings live on the server, so a reload shows them again.
// The gh stub answers `gh auth status` as signed out.
test("needs-you > settings persist across a reload and the gh banner matches the stub", async ({ page }) => {
	await signIn(page, "/settings");
	const name = page.getByRole("textbox", { name: /your name/i });
	await name.fill("Nav");
	const template = page.getByRole("textbox", { name: /start with agent/i });
	await template.fill('codex exec "{brief}"');
	// Every field saves on blur, so the reload waits for the save that
	// carries the new template.
	const saved = page.waitForResponse(
		(response) => response.url().includes("settings/set") && (response.request().postData() ?? "").includes("codex"),
	);
	await page.keyboard.press("Tab");
	await saved;
	await page.reload();
	await expect(page.getByRole("textbox", { name: /your name/i })).toHaveValue("Nav");
	await expect(page.getByRole("textbox", { name: /start with agent/i })).toHaveValue('codex exec "{brief}"');
	const banner = page.getByRole("alert");
	await expect(banner).toContainText("gh is not signed in");
	// gh's own message names the command too, so the check finds the chip.
	await expect(page.getByText("gh auth login", { exact: true })).toBeVisible();
});
