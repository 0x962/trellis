import { expect, type Page, test } from "@playwright/test";
import { get, statusOf } from "./api";
import { type CliProject, type CliTicket, createTicket, trellis } from "./cli";
import { cardOf, cardOrder, columnOf, signIn, toastOf } from "./support";

// Each test seeds a project of its own and reads only its own cards. A test
// therefore never reads a column that another test changed, and a repeated
// run starts from the same board. The key is KB and the first number that
// no project on the server holds.
const seedBoard = (titles: string[]) => {
	const taken = new Set(trellis<CliProject[]>(["projects", "list"]).map((project) => project.key));
	let n = 1;
	while (taken.has(`KB${n}`)) n++;
	const key = `KB${n}`;
	trellis(["projects", "create", "--key", key, "--name", `Kanban ${n}`]);
	return { key, ids: titles.map((title) => createTicket(key, title).identifier) };
};

// The init script registers its drop listener before the drag library
// registers its own, so the stamp comes before the board reacts.
const dropProbe = `(() => {
	window.__drop = { droppedAt: 0, movedAt: 0 };
	window.addEventListener("drop", () => { window.__drop.droppedAt = performance.now(); }, true);
})();`;

type DropMarks = { droppedAt: number; movedAt: number };

// Stamps the first DOM change after which `column` holds the card.
const watchMove = (page: Page, column: string, identifier: string) =>
	page.evaluate(
		([column, identifier]) => {
			const marks = (window as unknown as { __drop: DropMarks }).__drop;
			const observer = new MutationObserver(() => {
				const list = document.querySelector(`ul[aria-label^="${column},"]`);
				if (list?.querySelector(`li[aria-label^="${identifier} "]`) == null) return;
				marks.movedAt = performance.now();
				observer.disconnect();
			});
			observer.observe(document, { subtree: true, childList: true });
		},
		[column, identifier] as const,
	);

type TimelineItem = { kind: string; field: string | null; actor: unknown };

// M3: a drop writes a status activity for the person who dropped, and the
// board shows the card in its new column before the server answers.
test("kanban > a drag to another column moves the ticket, writes a status activity, and patches the board @timing", async ({
	page,
}) => {
	const { key, ids } = seedBoard(["Drag this card to In Progress"]);
	const id = ids[0]!;
	await page.addInitScript(dropProbe);
	await signIn(page, `/p/${key}/board`);
	await expect(cardOf(columnOf(page, "Todo"), id)).toBeVisible();
	await watchMove(page, "In Progress", id);
	await cardOf(page, id).dragTo(columnOf(page, "In Progress"));
	await expect(cardOf(columnOf(page, "In Progress"), id)).toBeVisible();
	await expect(cardOf(columnOf(page, "Todo"), id)).toHaveCount(0);
	await expect.poll(() => statusOf(id)).toBe("In Progress");
	const timeline = await get<{ items: TimelineItem[] }>(`/tickets/${id}/timeline`);
	const statusRows = timeline.items.filter((item) => item.kind === "activity" && item.field === "status");
	expect(statusRows).toHaveLength(1);
	expect(JSON.stringify(statusRows[0]!.actor)).toContain("navid");
	const marks = await page.evaluate(() => (window as unknown as { __drop: DropMarks }).__drop);
	const gap = marks.movedAt - marks.droppedAt;
	test.info().annotations.push({ type: "optimistic paint after the drop", description: `${gap.toFixed(1)} ms` });
	console.log(`kanban: the card moved ${gap.toFixed(1)} ms after the drop`);
	expect(marks.droppedAt).toBeGreaterThan(0);
	expect(gap).toBeLessThanOrEqual(16);
});

// The last card goes above the first. The server keeps the order, so the
// CLI and a reload both read it back.
test("kanban > an in-column reorder persists after a reload", async ({ page }) => {
	const { key, ids } = seedBoard([
		"Reorder the Todo column once",
		"Reorder the Todo column twice",
		"Reorder the Todo column three times",
		"Move this card to the top of Todo",
	]);
	await signIn(page, `/p/${key}/board`);
	const todo = columnOf(page, "Todo");
	for (const id of ids) await expect(cardOf(todo, id)).toBeVisible();
	const before = await cardOrder(todo);
	const last = before[before.length - 1]!;
	await cardOf(todo, last).dragTo(cardOf(todo, before[0]!), { targetPosition: { x: 24, y: 4 } });
	const expected = [last, ...before.slice(0, -1)];
	await expect.poll(() => cardOrder(todo)).toEqual(expected);
	await expect
		.poll(() =>
			trellis<CliTicket[]>(["list", "--project", key, "--status", "todo", "--sort", "position"]).map(
				(ticket) => ticket.identifier,
			),
		)
		.toEqual(expected);
	await page.reload();
	await expect(cardOf(columnOf(page, "Todo"), last)).toBeVisible();
	expect(await cardOrder(columnOf(page, "Todo"))).toEqual(expected);
});

// The page gets no event stream, so the board keeps the version it
// loaded. A CLI edit then makes that version stale, and the server
// rejects the move with a version conflict.
test("kanban > a rejected move puts the card back and shows a toast", async ({ page }) => {
	const { key, ids } = seedBoard(["Reject the drop of a stale card"]);
	const id = ids[0]!;
	await page.route("**/api/events**", (route) => route.abort());
	await signIn(page, `/p/${key}/board`);
	await expect(cardOf(columnOf(page, "Todo"), id)).toBeVisible();
	trellis(["edit", id, "--title", `Reject the drop of a stale card ${Date.now()}`]);
	await cardOf(page, id).dragTo(columnOf(page, "In Progress"));
	await expect(
		toastOf(page, `${id} did not move to In Progress. Another actor changed the ticket first.`),
	).toBeVisible();
	await expect(cardOf(columnOf(page, "Todo"), id)).toBeVisible();
	await expect(cardOf(columnOf(page, "In Progress"), id)).toHaveCount(0);
	expect(await statusOf(id)).toBe("Todo");
});

// `s` on a focused card opens the status picker, the keyboard equivalent
// of a drag. Tab walks to the status and Enter moves the card.
test("kanban > the status picker moves a card from the keyboard", async ({ page }) => {
	const { key, ids } = seedBoard(["Move this card from the keyboard"]);
	const id = ids[0]!;
	await signIn(page, `/p/${key}/board`);
	const card = cardOf(columnOf(page, "Todo"), id);
	await expect(card).toBeVisible();
	await card.focus();
	await page.keyboard.press("s");
	const picker = page.getByRole("dialog").filter({ hasText: "Choose a status" });
	await expect(picker).toBeVisible();
	const target = picker.getByRole("button").filter({ hasText: /^In Progress$/ });
	for (let step = 0; step < 12; step++) {
		if (await target.evaluate((element) => element === document.activeElement)) break;
		await page.keyboard.press("Tab");
	}
	await expect(target).toBeFocused();
	await page.keyboard.press("Enter");
	await expect(cardOf(columnOf(page, "In Progress"), id)).toBeVisible();
	await expect.poll(() => statusOf(id)).toBe("In Progress");
});
