import { expect, test } from "@playwright/test";
import { createTicket, ensureProject, trellis } from "./cli";
import { failingPrUrl } from "./ghReplies";
import { signIn } from "./support";

// PRS-2 is the child of PRS-1 and links the pull request that the gh stub
// answers with one failing check.
test.beforeAll(() => {
	if (!ensureProject("PRS", "Pull requests")) return;
	createTicket("PRS", "Ship the typecheck fix");
	createTicket("PRS", "Land the desktop typecheck", ["--parent", "PRS-1"]);
	trellis(["pr", "add", "PRS-2", failingPrUrl]);
});

test("prs > a linked pull request shows its row, and its parent shows the failing CI", async ({ page }) => {
	await signIn(page, "/t/PRS-2");
	const row = page.locator("[data-pr-row]");
	await expect(row).toContainText("Fix the desktop typecheck");
	await expect(row).toContainText("#7");
	await row.hover();
	const title = row.getByRole("link", { name: "Fix the desktop typecheck" });
	const open = row.getByRole("button", { name: "Open on GitHub" });
	const manage = row.getByRole("button", { name: "Unlink PR #7" });
	const reviewState = row.locator("[data-review-state]");
	await expect(title).toHaveCSS("text-decoration-line", "none");
	await expect(open).toBeVisible();
	await expect(manage).toBeVisible();
	const [openBox, manageBox, reviewBox] = await Promise.all([
		open.boundingBox(),
		manage.boundingBox(),
		reviewState.boundingBox(),
	]);
	expect(openBox).not.toBeNull();
	expect(manageBox).not.toBeNull();
	expect(reviewBox).not.toBeNull();
	expect(reviewBox!.x).toBeGreaterThan(openBox!.x);
	expect(reviewBox!.x).toBeGreaterThan(manageBox!.x);
	await page.goto("/t/PRS-1");
	const children = page.getByRole("region", { name: /Sub-tickets/ });
	await expect(children.getByLabel(/ PR, checks failed/)).toBeVisible();
});

test("linked pull requests use the ticket table surface", async ({ page }) => {
	await signIn(page, "/p/PRS/table");
	const tableBand = await page
		.getByRole("rowgroup")
		.first()
		.evaluate((element) => getComputedStyle(element).backgroundColor);

	await page.goto("/t/PRS-2");
	const section = page.getByRole("region", { name: "PRs" });
	const list = section.locator("ul");
	const prRow = section.locator("[data-pr-row]");
	await expect(list).toHaveCSS("border-top-width", "1px");
	await expect(list).toHaveCSS("overflow", "hidden");
	await expect(prRow).toHaveCSS("border-left-width", "0px");
	await expect(prRow).toHaveCSS("border-top-left-radius", "0px");
	await prRow.hover();
	await expect(prRow).toHaveCSS("background-color", tableBand);
});
