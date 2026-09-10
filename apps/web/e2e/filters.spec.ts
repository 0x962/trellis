import { expect, type Page, test } from "@playwright/test";
import { type CliTicket, createTicket, ensureProject, runPasted } from "./cli";
import { rowOf, signIn } from "./support";

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

// Two of the five tickets are both High and Todo: FLT-1 and FLT-4.
test.beforeAll(() => {
	if (!ensureProject("FLT", "Filters")) return;
	createTicket("FLT", "Pin the list query to the index", ["--priority", "high"]);
	createTicket("FLT", "Stream the export page by page", ["--priority", "high", "--status", "in-progress"]);
	createTicket("FLT", "Trim the idle page cache", ["--priority", "low"]);
	createTicket("FLT", "Rotate the server log at 10 MB", ["--priority", "high"]);
	createTicket("FLT", "Batch the GraphQL poller", ["--priority", "urgent"]);
});

// The identifiers of the table rows, sorted.
const rowIds = (page: Page) =>
	page
		.locator('[role="row"][data-identifier]')
		.evaluateAll((rows) => rows.map((row) => (row as HTMLElement).dataset.identifier!).sort());

const chipOf = (page: Page, field: string) => page.locator(`[data-filter-chip="${field}"]`);

// Adds one value of one field through the Filter picker. A multi-value
// field keeps the picker open, so Escape closes it.
const addFilter = async (page: Page, field: string, value: string) => {
	await page.getByRole("button", { name: "Filter", exact: true }).click();
	const picker = page.getByRole("dialog", { name: "Filter" });
	await picker.getByRole("option", { name: field }).click();
	await picker.getByRole("option", { name: value }).click();
	if (await picker.isVisible()) await page.keyboard.press("Escape");
	await expect(picker).toBeHidden();
};

// M3: the chips and the URL hold the same filters in both directions.
test("filters > chips write the URL, a reload keeps them, and a removed chip drops its param", async ({ page }) => {
	await signIn(page, "/p/FLT");
	await expect(rowOf(page, "FLT-5")).toBeVisible();
	await addFilter(page, "Priority", "High");
	await expect(page).toHaveURL(/[?&]priority=high(&|$)/);
	await addFilter(page, "Status", "Todo");
	await expect(page).toHaveURL(/[?&]status=todo(&|$)/);
	await expect.poll(() => rowIds(page)).toEqual(["FLT-1", "FLT-4"]);

	await page.reload();
	await expect(chipOf(page, "priority")).toContainText("High");
	await expect(chipOf(page, "status")).toContainText("Todo");
	await expect.poll(() => rowIds(page)).toEqual(["FLT-1", "FLT-4"]);

	await page.getByRole("button", { name: "Remove Priority filter" }).click();
	await expect(page).not.toHaveURL(/priority=/);
	await expect(page).toHaveURL(/[?&]status=todo(&|$)/);
	await expect(chipOf(page, "priority")).toHaveCount(0);
	await expect.poll(() => rowIds(page)).toEqual(["FLT-1", "FLT-3", "FLT-4", "FLT-5"]);
});

// A negated status stays negated when the page loads from the URL and when
// a second filter navigates, because the router validates the typed view
// again. FLT-2 is the one ticket outside Todo, and it is High.
test("filters > a status=!todo URL shows the tickets outside Todo and keeps the negation", async ({ page }) => {
	await signIn(page, "/p/FLT?status=!todo");
	await expect(chipOf(page, "status")).toContainText("is not");
	await expect.poll(() => rowIds(page)).toEqual(["FLT-2"]);
	await addFilter(page, "Priority", "High");
	await expect(page).toHaveURL(/[?&]status=!todo(&|$)/);
	await expect(page).toHaveURL(/[?&]priority=high(&|$)/);
	await expect(chipOf(page, "status")).toContainText("is not");
	await expect.poll(() => rowIds(page)).toEqual(["FLT-2"]);
});

// M3: "Copy as CLI" copies a `trellis list` command, and that command,
// pasted into a shell, returns the tickets the table shows. The command
// always names the sort, as features/filters/cli.test.ts states.
test("filters > Copy as CLI copies the trellis list command that returns the table's rows", async ({ page }) => {
	await signIn(page, "/p/FLT?status=todo&priority=high");
	await expect(chipOf(page, "status")).toBeVisible();
	await expect.poll(() => rowIds(page)).toEqual(["FLT-1", "FLT-4"]);
	await page.getByRole("button", { name: "Copy as CLI" }).click();
	const command = await page.evaluate(() => navigator.clipboard.readText());
	expect(command).toBe("trellis list --project FLT --status todo --priority high --sort -updatedAt");
	const listed = runPasted<CliTicket[]>(command);
	expect(listed.map((ticket) => ticket.identifier).sort()).toEqual(await rowIds(page));
});
