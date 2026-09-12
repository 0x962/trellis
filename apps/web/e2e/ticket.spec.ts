import { expect, test } from "@playwright/test";
import { createTicket, ensureProject } from "./cli";
import { peekOf, rowOf, signIn } from "./support";

// TKT-1 is the parent, TKT-2 its child; both are In Progress.
test.beforeAll(() => {
	if (!ensureProject("TKT", "Ticket")) return;
	createTicket("TKT", "Merge upstream 1.27 and keep every marked site", ["--status", "in-progress"]);
	createTicket("TKT", "Restore the fork pages after the merge", ["--status", "in-progress", "--parent", "TKT-1"]);
});

// WT-17. The sidebar carries a Search link of its own, so the check stays
// inside main.
test("an unknown identifier shows the not-found line and a search link", async ({ page }) => {
	await signIn(page, "/t/TKT-999");
	const main = page.getByRole("main");
	await expect(main.getByText("TKT-999 does not exist")).toBeVisible();
	const link = main.getByRole("link", { name: /search/i });
	await expect(link).toHaveAttribute("href", "/search?q=TKT-999");
});

// WT-18. The page remembers the list it came from, filters included, across
// a page-to-page hop: the peek on TKT-1, its full page, then its child
// TKT-2 on the page.
test("Back to list keeps the previous search params", async ({ page }) => {
	await signIn(page, "/p/TKT/table?status=in-progress");
	await rowOf(page, "TKT-1").getByText("Merge upstream 1.27", { exact: false }).click();
	await expect(peekOf(page, "TKT-1")).toBeVisible();
	await page.keyboard.press("o");
	await expect(page).toHaveURL(/\/t\/TKT-1$/);
	await page
		.getByRole("region", { name: /Sub-tickets/ })
		.getByRole("button", { name: /TKT-2/ })
		.click();
	await expect(page).toHaveURL(/\/t\/TKT-2$/);
	await page.getByRole("link", { name: "Back to list" }).click();
	await expect(page).toHaveURL(/\/p\/TKT\/table\?status=in-progress$/);
});

test("the ticket sections use the same Add button", async ({ page }) => {
	await signIn(page, "/t/TKT-1");
	for (const width of [1280, 375]) {
		await page.setViewportSize({ width, height: 812 });
		for (const name of [/Sub-tickets/, "PRs", "Attachments for TKT-1"]) {
			await expect(page.getByRole("region", { name }).getByRole("button", { name: "Add", exact: true })).toBeVisible();
		}
	}
});
