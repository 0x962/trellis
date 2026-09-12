import { expect, test } from "@playwright/test";
import { createTicket, ensureProject } from "./cli";
import { cardOf, rowOf, signIn } from "./support";

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

test("Back to list keeps the previous search params", async ({ page }) => {
	await signIn(page, "/p/TKT/table?status=in-progress");
	await rowOf(page, "TKT-1").getByText("Merge upstream 1.27", { exact: false }).click();
	await expect(page).toHaveURL(/\/t\/TKT-1$/);
	await page
		.getByRole("region", { name: /Sub-tickets/ })
		.getByRole("button", { name: /TKT-2/ })
		.click();
	await expect(page).toHaveURL(/\/t\/TKT-2$/);
	await page.getByRole("link", { name: "Back to list" }).click();
	await expect(page).toHaveURL(/\/p\/TKT\/table\?status=in-progress$/);
});

for (const path of ["/p/TKT", "/all"]) {
	test(`a board card opens the ticket page from ${path}`, async ({ page }) => {
		await signIn(page, path);
		await cardOf(page, "TKT-1").click();
		await expect(page).toHaveURL(/\/t\/TKT-1$/);
		const header = page.locator("header").filter({ has: page.getByRole("heading", { name: "TKT-1", exact: true }) });
		await expect(header.getByRole("link", { name: "Ticket", exact: true })).toBeVisible();
		await expect(header.getByRole("heading", { name: "TKT-1", exact: true })).toBeVisible();
		await expect(header.getByRole("button", { name: "More actions" })).toBeVisible();
		await expect(page.getByRole("textbox", { name: "Title", exact: true })).toBeVisible();
		await page.goBack();
		await expect(page).toHaveURL(new RegExp(`${path}$`));
	});
}

for (const path of ["/p/TKT/table", "/all/table"]) {
	test(`Enter opens the focused ticket from ${path}`, async ({ page }) => {
		await signIn(page, path);
		await rowOf(page, "TKT-1").focus();
		await page.keyboard.press("Enter");
		await expect(page).toHaveURL(/\/t\/TKT-1$/);
		await page.getByRole("link", { name: "Back to list" }).click();
		await expect(page).toHaveURL(new RegExp(`${path}$`));
	});
}

test("a search result opens a ticket and preserves the search", async ({ page }) => {
	await signIn(page, "/search?q=Merge%20upstream");
	await page.getByRole("grid", { name: "Search results" }).getByRole("link", { name: "TKT-1", exact: true }).click();
	await expect(page).toHaveURL(/\/t\/TKT-1$/);
	await page.getByRole("link", { name: "Back to list" }).click();
	await expect(page).toHaveURL(/\/search\?q=Merge%20upstream$/);
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

test("empty ticket sections use the same empty state", async ({ page }) => {
	await signIn(page, "/t/TKT-2");
	const sections = [
		{
			name: /Sub-tickets/,
			description: "Add a sub-ticket to split this work into smaller tasks.",
		},
		{
			name: "PRs",
			description: "Add a pull request to track its review and checks.",
		},
		{
			name: "Attachments for TKT-2",
			description: "Add a file or drop it anywhere on this ticket.",
		},
	];

	for (const expected of sections) {
		const section = page.getByRole("region", { name: expected.name });
		const title = section.getByRole("heading", { level: 2 });
		const helper = section.getByText(expected.description, { exact: true });
		await expect(helper).toBeVisible();
		const [titleBox, helperBox] = await Promise.all([title.boundingBox(), helper.boundingBox()]);
		expect(titleBox).not.toBeNull();
		expect(helperBox).not.toBeNull();
		expect(helperBox!.x).toBeCloseTo(titleBox!.x, 0);
		expect(helperBox!.y - titleBox!.y - titleBox!.height).toBeCloseTo(12, 0);
	}
});

test("the desktop ticket cards use the compact gap", async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 812 });
	await signIn(page, "/t/TKT-1");
	await expect(page.locator("[data-ticket-columns]")).toHaveCSS("column-gap", "12px");
	const [pageBox, cardBox] = await Promise.all([
		page.getByRole("main").boundingBox(),
		page.locator("[data-ticket-columns] > article").boundingBox(),
	]);
	expect(pageBox).not.toBeNull();
	expect(cardBox).not.toBeNull();
	expect(cardBox!.x - pageBox!.x).toBeCloseTo(8, 0);
});
