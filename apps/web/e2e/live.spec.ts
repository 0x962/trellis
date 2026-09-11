import { expect, type Response, test } from "@playwright/test";
import { createTicket, ensureProject, moveTicket } from "./cli";
import { signIn } from "./support";

test.beforeAll(() => {
	ensureProject("LIV", "Live");
});

// The browser and the server share the wall clock, so a `Date.now()` stamp
// in the page compares with the server's `updatedAt`. The observer stamps
// the first mutation after which the watched row carries the status. The
// table groups by status, so a row states its status as its group and
// draws no status cell.
const rowProbe = (identifier: string, group: string) => `(() => {
	window.__patchedAt = 0;
	new MutationObserver(() => {
		if (window.__patchedAt !== 0) return;
		const row = document.querySelector('[role="row"][data-identifier="${identifier}"][data-group="${group}"]');
		if (row !== null) window.__patchedAt = Date.now();
	}).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
})();`;

// M2: a `trellis move` from the CLI patches the open table row. The event
// time is the `updatedAt` the move commits, which the event summary carries.
test("live > a trellis move from the CLI patches the open table row within 500 ms @timing", async ({ page }) => {
	const ticket = createTicket("LIV", `Watch the row ${Date.now()}`);
	await page.addInitScript(rowProbe(ticket.identifier, "in-progress"));
	await signIn(page, "/p/LIV");
	const row = page.locator(`[role="row"][data-identifier="${ticket.identifier}"]`);
	await expect(row).toHaveAttribute("data-group", "todo");
	const moved = moveTicket(ticket.identifier, "in-progress");
	await expect(row).toHaveAttribute("data-group", "in-progress");
	const patchedAt = await page.evaluate(() => (window as unknown as { __patchedAt: number }).__patchedAt);
	const gap = patchedAt - Date.parse(moved.updatedAt);
	test.info().annotations.push({ type: "row patch after the event", description: `${gap} ms` });
	console.log(`live: the row patched ${gap} ms after the event`);
	expect(patchedAt).toBeGreaterThan(0);
	expect(gap).toBeLessThanOrEqual(500);
});

// The observer stamps the moment the rail first shows Done. The rail's text
// runs its labels and values together ("StatusDonePriority"), so the probe
// looks for the word without word boundaries.
const railProbe = `(() => {
	window.__doneAt = 0;
	new MutationObserver(() => {
		if (window.__doneAt !== 0) return;
		const rail = document.querySelector('[aria-label="Properties"]');
		if (rail !== null && rail.textContent.includes("Done")) window.__doneAt = Date.now();
	}).observe(document, { subtree: true, childList: true, characterData: true });
})();`;

// The answer to the tickets.move call. The batch link can fold the call
// into a batch request, so the path is looked for in the request body too.
const MOVE_PATH = "/rpc/tickets/move";
const isMove = (response: Response) =>
	response.ok() && (response.url().includes(MOVE_PATH) || (response.request().postData() ?? "").includes(MOVE_PATH));

test("live > a ticket change in one tab repaints the ticket page in another inside the budget @timing", async ({
	page,
	context,
}) => {
	const ticket = createTicket("LIV", `Change status from the other tab ${Date.now()}`);
	moveTicket(ticket.identifier, "human-review");
	await page.addInitScript(railProbe);
	await signIn(page, `/t/${ticket.identifier}`);
	const rail = page.getByLabel("Properties");
	await expect(rail.getByText("Human Review")).toBeVisible();

	const other = await context.newPage();
	await signIn(other, `/t/${ticket.identifier}`);
	await other
		.getByLabel("Properties")
		.getByRole("button", { name: /Human Review/ })
		.click();
	const settled = other.waitForResponse(isMove);
	await other.getByRole("option", { name: "Done", exact: true }).click();
	await settled;
	const committedAt = Date.now();

	await expect(rail.getByText("Done")).toBeVisible();
	const doneAt = await page.evaluate(() => (window as unknown as { __doneAt: number }).__doneAt);
	const gap = doneAt - committedAt;
	test.info().annotations.push({ type: "page patch after the commit", description: `${gap} ms` });
	console.log(`live: the other tab repainted ${gap} ms after the commit`);
	expect(doneAt).toBeGreaterThan(0);
	expect(gap).toBeLessThanOrEqual(100);
	await other.close();
});
