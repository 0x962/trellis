import { expect, test } from "@playwright/test";
import type { AgentRun } from "@trellis/api";
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
		for (const name of [/Sub-tickets/, "Attachments for TKT-1"]) {
			await expect(page.getByRole("region", { name }).getByRole("button", { name: "Add", exact: true })).toBeVisible();
		}
		await page.getByRole("tab", { name: "Changes", exact: true }).click();
		await expect(
			page.getByRole("region", { name: "PRs" }).getByRole("button", { name: "Add", exact: true }),
		).toBeVisible();
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
		if (expected.name === "PRs") await page.getByRole("tab", { name: "Changes", exact: true }).click();
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

for (const width of [1920, 1280, 900, 390]) {
	test(`the ticket body stays centered at ${width} px`, async ({ page }, testInfo) => {
		await page.setViewportSize({ width, height: 900 });
		await signIn(page, "/t/TKT-1");
		const content = page.locator("[data-ticket-content]");
		await expect(content).toBeVisible();
		const bounds = await content.evaluate((element) => {
			const article = element.parentElement!;
			const bodyBox = element.getBoundingClientRect();
			const articleBox = article.getBoundingClientRect();
			const left = bodyBox.left - articleBox.left - article.clientLeft;
			return {
				left,
				right: article.clientWidth - left - bodyBox.width,
				width: bodyBox.width,
				available: article.clientWidth,
				overflow: article.scrollWidth - article.clientWidth,
			};
		});
		expect(bounds.left).toBeCloseTo(bounds.right, 0);
		expect(bounds.width).toBeCloseTo(Math.min(856, bounds.available), 0);
		expect(bounds.overflow).toBe(0);
		await expect(page.getByRole("textbox", { name: "Title", exact: true })).toHaveCSS("text-align", "start");
		await expect(page.getByRole("complementary", { name: "Properties" })).toHaveCount(width >= 768 ? 1 : 0);
		expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
		await page.screenshot({ path: testInfo.outputPath("centered-ticket.png") });
	});
}

test("Activity opens first and Agent contains only execution details", async ({ page }) => {
	await signIn(page, "/t/TKT-1");
	const work = page.getByRole("region", { name: "Ticket work area" });
	await expect(work.getByRole("tab")).toHaveText(["Activity", "Agent", "Changes", "Checks", "Flows"]);
	await expect(work.getByRole("tab", { name: "Activity", exact: true })).toHaveAttribute("aria-selected", "true");
	await expect(work.locator('[data-kind="activity"]').first()).toBeVisible();
	await expect(work.getByRole("region", { name: "Execution", exact: true })).toHaveCount(0);
	await work.getByRole("tab", { name: "Agent", exact: true }).click();
	const panel = work.getByRole("tabpanel");
	await expect(panel.getByRole("region", { name: "Execution", exact: true })).toBeVisible();
	await expect(panel.getByText("No assigned agent", { exact: true })).toBeVisible();
	await expect(panel.locator('[data-kind="activity"]')).toHaveCount(0);
	await expect(panel.getByRole("region", { name: /Sub-tickets|PRs|Attachments/ })).toHaveCount(0);
	await expect(page.getByRole("region", { name: "Sub-tickets", exact: true })).toBeVisible();
	await expect(page.getByRole("region", { name: "Attachments for TKT-1", exact: true })).toBeVisible();
	await page.goto("/t/TKT-1#attempt-example");
	await expect(work.getByRole("tab", { name: "Agent", exact: true })).toHaveAttribute("aria-selected", "true");
});

test("each assigned agent has a stable tab with its current work state", async ({ page }) => {
	const base = {
		name: "Senior Software Engineer",
		runtime: "native",
		personaId: "01K00000000000000000000001",
		personaName: "Senior Software Engineer",
		kind: "builder",
		instruction: "Build the ticket.",
		projectId: "01K00000000000000000000002",
		projectPath: "TKT",
		ticketId: "01K00000000000000000000003",
		ticketIdentifier: "TKT-1",
		state: "running",
		processStatus: "running",
		workspaceId: "/tmp/trellis-agent-tab",
		error: null,
		sessionId: null,
		sessionLost: false,
		createdAt: "2026-09-16T12:00:00.000Z",
		updatedAt: "2026-09-16T12:00:00.000Z",
	} satisfies Partial<AgentRun>;
	const runs = [
		{
			...base,
			id: "01K00000000000000000000011",
			terminalId: "attempt-one",
			url: "https://example.test/one",
			observation: {
				checkedAt: "2026-09-16T12:00:00.000Z",
				controllable: true,
				activity: { state: "working", updatedAt: "2026-09-16T12:00:00.000Z" },
				outcome: null,
				turnId: "turn-one",
			},
		},
		{
			...base,
			id: "01K00000000000000000000012",
			terminalId: "attempt-two",
			url: "https://example.test/two",
			observation: {
				checkedAt: "2026-09-16T12:00:00.000Z",
				controllable: true,
				activity: { state: "idle", updatedAt: "2026-09-16T12:00:00.000Z" },
				outcome: null,
				turnId: null,
			},
		},
	] satisfies AgentRun[];
	let includeSecondRun = false;
	let failRunList = false;
	let runListResponse = 0;
	await page.route("**/rpc/**", async (route) => {
		const request = route.request();
		if (!request.url().includes("agentRuns/list") && !request.postData()?.includes("agentRuns/list"))
			return route.continue();
		if (failRunList) return route.abort("failed");
		const updatedAt = new Date(Date.parse(base.updatedAt) + runListResponse++).toISOString();
		const visibleRuns = (includeSecondRun ? runs : runs.slice(0, 1)).map((run) => ({ ...run, updatedAt }));
		if (!request.url().includes("__batch__")) return route.fulfill({ json: { json: visibleRuns } });
		const calls = JSON.parse(request.postData()!) as { url: string }[];
		const indexes = new Set(calls.flatMap((call, index) => (call.url.includes("agentRuns/list") ? [index] : [])));
		const response = await route.fetch();
		const body = (await response.text()).replace(/^data: (.+)$/gm, (_, data: string) => {
			const event = JSON.parse(data) as { index: number; body: { json: unknown } };
			if (indexes.has(event.index)) event.body.json = visibleRuns;
			return `data: ${JSON.stringify(event)}`;
		});
		await route.fulfill({ response, body });
	});
	await page.emulateMedia({ reducedMotion: "reduce" });
	await signIn(page, "/t/TKT-1#attempt-two");

	const work = page.getByRole("region", { name: "Ticket work area" });
	const first = work.getByRole("tab", { name: "Senior Software Engineer 1, Working", exact: true });
	const second = work.getByRole("tab", { name: "Senior Software Engineer 2", exact: true });
	await expect(first).toBeVisible();
	await expect(first).toHaveAttribute("aria-selected", "true");
	await expect(first).toHaveAccessibleName("Senior Software Engineer 1, Working");
	await expect(second).toHaveCount(0);
	includeSecondRun = true;
	await expect(second).toHaveAttribute("aria-selected", "true");
	await expect(first.locator("svg")).toHaveAttribute("data-state", "working-mild");
	await expect(second.locator("svg")).toHaveAttribute("data-state", "static");
	await expect(first.locator(".persona-effect")).toHaveCSS("opacity", "0");
	await expect(first.locator(".persona-work-dot")).toHaveCSS("opacity", "1");
	await expect(work.getByRole("link", { name: "Open workspace" })).toHaveAttribute("href", "https://example.test/two");

	await second.focus();
	await page.keyboard.press("ArrowLeft");
	await expect(first).toHaveAttribute("aria-selected", "true");
	await expect(work.getByRole("link", { name: "Open workspace" })).toHaveAttribute("href", "https://example.test/one");

	await page.evaluate(() => {
		window.location.hash = "attempt-old";
	});
	await expect(page).toHaveURL(/#attempt-old$/);
	await page.waitForResponse(
		(response) =>
			response.request().url().includes("agentRuns/list") ||
			(response.request().postData()?.includes("agentRuns/list") ?? false),
	);
	await expect(first).toHaveAttribute("aria-selected", "true");
	const nextPoll = page.waitForResponse(
		(response) =>
			response.request().url().includes("agentRuns/list") ||
			(response.request().postData()?.includes("agentRuns/list") ?? false),
	);
	const changes = work.getByRole("tab", { name: "Changes", exact: true });
	await changes.click();
	await nextPoll;
	await expect(changes).toHaveAttribute("aria-selected", "true");

	failRunList = true;
	await expect(work.getByRole("alert")).toContainText("Failed to fetch");
	await expect(first).toBeVisible();
});
