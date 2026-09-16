import { expect, test } from "@playwright/test";
import { get, patch, post, put } from "./api";
import { createTicket, ensureProject, moveTicket, trellis } from "./cli";
import { failingPrUrl } from "./ghReplies";
import { mapRpcResponse } from "./mapRpcResponse";
import { rowOf, signIn } from "./support";

// signIn sets the actor name on the shared server. Each test restores the saved settings.
let before: unknown;
test.beforeEach(async () => {
	before = await get("/settings");
});
test.afterEach(async () => {
	await put("/settings", before);
});

// NYO-1 links a pull request with a failed check, and NYO-2 waits in Human
// Review.
test.beforeAll(() => {
	if (!ensureProject("NYO", "Needs you")) return;
	createTicket("NYO", "Fix the desktop typecheck", ["--status", "in-progress"]);
	trellis(["pr", "add", "NYO-1", failingPrUrl]);
	createTicket("NYO", "Read the release notes", ["--status", "human-review"]);
});

test("needs-you > human review tickets qualify across roots and subprojects", async ({ page }) => {
	ensureProject("NYR", "Another review project");
	const other = createTicket("NYR", "Review another project", ["--status", "human-review"]);
	const agent = createTicket("NYR", "Agent review stays out", ["--status", "agent-review"]);
	trellis(["projects", "create", "--parent", "NYR", "--name", "Web", "--slug", "web"]);
	const child = createTicket("NYR.web", "Review a subproject", ["--status", "human-review"]);
	await post("/projects/NYR/statuses", { name: "Final approval", category: "review", reviewer: "human" });
	const custom = createTicket("NYR", "Review a custom status", ["--status", "final-approval"]);

	await signIn(page, "/needs-you");
	await expect(page.getByRole("heading", { name: "Needs you", exact: true })).toBeVisible();
	await expect(
		page.getByRole("navigation", { name: "Workspace" }).getByRole("link", { name: "Needs you" }),
	).toBeVisible();
	for (const identifier of ["NYO-2", other.identifier, child.identifier, custom.identifier]) {
		await expect(rowOf(page, identifier)).toBeVisible();
	}
	await expect(rowOf(page, "NYO-1")).toHaveCount(0);
	await expect(rowOf(page, agent.identifier)).toHaveCount(0);
	await rowOf(page, child.identifier).getByText("Review a subproject", { exact: true }).click();
	await expect(page).toHaveURL(new RegExp(`/t/${child.identifier}$`));
});

test("needs-you > status and reviewer changes update membership live", async ({ page }) => {
	ensureProject("NYL", "Live review");
	const ticket = createTicket("NYL", "Review live changes");
	await signIn(page, "/needs-you");
	await expect(rowOf(page, "NYO-2")).toBeVisible();
	await expect(rowOf(page, ticket.identifier)).toHaveCount(0);
	moveTicket(ticket.identifier, "human-review");
	await expect(rowOf(page, ticket.identifier)).toBeVisible();
	moveTicket(ticket.identifier, "agent-review");
	await expect(rowOf(page, ticket.identifier)).toHaveCount(0);
	moveTicket(ticket.identifier, "human-review");
	await expect(rowOf(page, ticket.identifier)).toBeVisible();
	await patch("/projects/NYL/statuses/human-review", { reviewer: "agent" });
	await expect(rowOf(page, ticket.identifier)).toHaveCount(0);
	await patch("/projects/NYL/statuses/human-review", { reviewer: "human" });
	await expect(rowOf(page, ticket.identifier)).toBeVisible();
	moveTicket(ticket.identifier, "done", "human:dana");
	await expect(rowOf(page, ticket.identifier)).toHaveCount(0);
});

test("needs-you > an empty review list explains which tickets qualify", async ({ page }) => {
	await page.route(/\/rpc\/(__batch__|tickets\/(list|counts))/, (route) =>
		mapRpcResponse(route, (key, value) => {
			if (key === "items" || key === "byStatus") return [];
			if (key === "total") return 0;
			if (key === "nextCursor") return null;
			return value;
		}),
	);
	await signIn(page, "/needs-you");
	await expect(page.getByRole("heading", { name: "Nothing needs review" })).toBeVisible();
	await expect(page.getByText("Tickets in human review appear here.")).toBeVisible();
	await expect(page.getByRole("link", { name: "Clear filters" })).toHaveCount(0);
});

test("needs-you > a failed request shows an error instead of an empty review list", async ({ page }) => {
	await page.route("**/rpc/**", (route) => {
		const request = route.request();
		const hasList = request.url().includes("/needsYou/list") || request.postData()?.includes("/needsYou/list");
		return hasList ? route.abort("failed") : route.continue();
	});
	await signIn(page, "/needs-you");
	await expect(page.getByRole("heading", { name: "The items did not load." }).first()).toBeVisible();
	await expect(page.getByRole("heading", { name: "Nothing needs review" })).toHaveCount(0);
});

// E2E-04. The settings live on the server, so a reload shows them again.
// The gh stub answers `gh auth status` as signed out.
test("needs-you > settings persist across a reload and the gh banner matches the stub", async ({ page }) => {
	await signIn(page, "/settings");
	const name = page.getByRole("textbox", { name: /your name/i });
	await name.fill("Nav");
	const saved = page.waitForResponse(
		(response) =>
			(response.url().includes("settings/set") || (response.request().postData() ?? "").includes("settings/set")) &&
			(response.request().postData() ?? "").includes("Nav"),
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

test("needs-you > sections, sort, mentions, ignore, and palette snooze", async ({ page }) => {
	ensureProject("NYI", "Inbox actions");
	const ticket = createTicket("NYI", "Inbox action ticket", ["--status", "human-review", "--priority", "urgent"]);
	const comment = await post<{ id: string }>(`/tickets/${ticket.identifier}/comments`, {
		body: "@dana please verify the change",
	});
	await signIn(page, "/needs-you");
	const review = page.getByRole("region", { name: "Needs review", exact: true });
	const mentions = page.getByRole("region", { name: "Mentioned", exact: true });
	await expect(review.getByText("Inbox action ticket", { exact: true })).toBeVisible();
	await expect(mentions.getByText("@dana please verify the change", { exact: false })).toBeVisible();
	await mentions.getByText("Inbox action ticket", { exact: true }).click();
	await expect(page).toHaveURL(new RegExp(`thread=${comment.id}`));
	await expect(page.getByRole("region", { name: "Mentioned comment" })).toContainText("@dana please verify the change");
	await page.goBack();
	await expect(page.getByLabel("Needs you has items")).toBeVisible();
	await page.getByRole("button", { name: "Display", exact: true }).click();
	await page.getByRole("combobox", { name: "Sort by" }).click();
	await page.getByRole("option", { name: "Title", exact: true }).click();
	await expect(page).toHaveURL(/sort=title/);
	await page.reload();
	await page.getByRole("button", { name: "Display", exact: true }).click();
	await expect(page.getByRole("combobox", { name: "Sort by" })).toHaveText("Title");
	await page.keyboard.press("Escape");
	const item = review.locator(`[data-identifier="${ticket.identifier}"]`);
	await item.getByRole("button", { name: "Item options" }).click();
	await page.getByRole("menuitem", { name: "Snooze", exact: true }).click();
	const field = page.getByRole("dialog").getByRole("combobox");
	await expect(field).toHaveValue(`Snooze ${ticket.identifier} `);
	await field.fill(`Snooze ${ticket.identifier} 5m`);
	await expect(page.getByRole("option", { name: /Snooze until/ })).toBeVisible();
	await page.getByRole("dialog").getByRole("combobox").press("Enter");
	await expect(item).toHaveCount(0);
	await expect(mentions.getByText("Inbox action ticket", { exact: true })).toBeVisible();
	await page.getByRole("button", { name: "Filter", exact: true }).click();
	await page.getByRole("option", { name: "Snoozed", exact: true }).click();
	await expect(item).toBeVisible();
	await item.getByRole("button", { name: "Item options" }).click();
	await page.getByRole("menuitem", { name: "Restore", exact: true }).click();
	await page.getByRole("button", { name: "Filter", exact: true }).click();
	await page.getByRole("option", { name: "Active", exact: true }).click();
	await expect(item).toBeVisible();
	await item.getByRole("button", { name: "Item options" }).click();
	await page.getByRole("menuitem", { name: "Ignore", exact: true }).click();
	await expect(item).toHaveCount(0);
	await post(`/comments/${comment.id}/resolve`, { resolved: true });
	await expect(mentions.getByText("Inbox action ticket", { exact: true })).toHaveCount(0);
});

test("needs-you > the dot clears when empty and returns at snooze expiry", async ({ page }) => {
	const hidden: string[] = [];
	let ticket: ReturnType<typeof createTicket> | undefined;
	try {
		while (true) {
			const list = await get<{ items: { id: string }[] }>("/needs-you?limit=200");
			if (list.items.length === 0) break;
			for (const item of list.items) {
				await patch(`/needs-you/${encodeURIComponent(item.id)}`, { action: "ignore" });
				hidden.push(item.id);
			}
		}
		await signIn(page, "/needs-you");
		await expect(page.getByLabel("Needs you has items")).toHaveCount(0);
		ensureProject("NYW", "Snooze wake");
		ticket = createTicket("NYW", "Wake automatically", ["--status", "human-review"]);
		await expect(page.getByLabel("Needs you has items")).toBeVisible();
		const list = await get<{ items: { id: string }[] }>(`/needs-you?ticket=${ticket.identifier}`);
		await patch(`/needs-you/${encodeURIComponent(list.items[0]!.id)}`, {
			action: "snooze",
			until: new Date(Date.now() + 4000).toISOString(),
		});
		await expect(rowOf(page, ticket.identifier)).toHaveCount(0);
		await expect(page.getByLabel("Needs you has items")).toHaveCount(0);
		await expect(rowOf(page, ticket.identifier)).toBeVisible({ timeout: 7000 });
		await expect(page.getByLabel("Needs you has items")).toBeVisible();
		await page.keyboard.press("Meta+k");
		await page.getByRole("dialog").getByRole("combobox").fill(`Snooze ${ticket.identifier} yesterday`);
		await expect(page.getByText("Choose a future time.")).toBeVisible();
		await page.getByRole("dialog").getByRole("combobox").fill(`Snooze ${ticket.identifier} m1`);
		await expect(page.getByRole("option", { name: /Snooze until/ })).toBeVisible();
		await page.getByRole("dialog").getByRole("combobox").press("Enter");
		await expect(rowOf(page, ticket.identifier)).toHaveCount(0);
		await expect(page.getByLabel("Needs you has items")).toHaveCount(0);
	} finally {
		for (const id of hidden) await patch(`/needs-you/${encodeURIComponent(id)}`, { action: "restore" });
		if (ticket) moveTicket(ticket.identifier, "done", "human:dana");
	}
});

test("needs-you > shared controls, group counts, and row columns work at desktop and phone widths", async ({
	page,
}) => {
	ensureProject("NYD", "Inbox display");
	createTicket(
		"NYD",
		"Review a very long ticket title that must truncate without moving the project, actor, age, or menu columns",
		["--status", "human-review"],
	);
	await signIn(page, "/needs-you");
	const topbar = page.locator("[data-page-topbar]");
	await expect(topbar.getByRole("button", { name: "Filter", exact: true })).toBeVisible();
	await expect(topbar.getByRole("button", { name: "Display", exact: true })).toBeVisible();
	await expect(topbar.getByRole("combobox")).toHaveCount(0);
	const review = page.getByRole("region", { name: "Needs review", exact: true });
	const group = review.getByRole("button", { name: "Needs review", exact: true });
	const total = await get<{ total: number }>("/needs-you?section=review");
	await expect(review.locator("[data-count]")).toHaveText(String(total.total));
	await group.click();
	await expect(group).toHaveAttribute("aria-expanded", "false");
	await expect(review.locator("[data-inbox-item]").first()).toBeHidden();
	await page.reload();
	await expect(group).toHaveAttribute("aria-expanded", "false");
	await group.click();
	await expect(review.locator("[data-inbox-item]").first()).toBeVisible();
	await topbar.getByRole("button", { name: "Display", exact: true }).click();
	await page.getByRole("button", { name: "Sort direction" }).click();
	await expect(page).toHaveURL(/sort=-priority/);
	await page.keyboard.press("Escape");
	const cells = review.locator("[data-inbox-item] [data-column=age]");
	const first = await cells.nth(0).boundingBox();
	const second = await cells.nth(1).boundingBox();
	expect(first!.x).toBe(second!.x);
	expect(first!.width).toBe(second!.width);
	await page.setViewportSize({ width: 390, height: 844 });
	const item = review.locator("[data-inbox-item]").first();
	await expect(item).toBeVisible();
	await expect(item.getByRole("link")).toHaveAccessibleName(new RegExp((await item.getAttribute("data-identifier"))!));
	await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
	await item.getByRole("button", { name: "Item options" }).click();
	await expect(page.getByRole("menuitem", { name: "Snooze", exact: true })).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(item.getByRole("button", { name: "Item options" })).toBeFocused();
	await page.setViewportSize({ width: 320, height: 844 });
	await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
	await page.getByRole("button", { name: "Filter", exact: true }).click();
	await page.getByRole("option", { name: "Snoozed", exact: true }).click();
	await expect(page.getByRole("button", { name: "Remove items filter" })).toBeVisible();
	await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
	await page.getByRole("button", { name: "Remove items filter" }).click();
	await expect(page).toHaveURL(/visibility=active/);
	await page.keyboard.press("Meta+Backslash");
	await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});
