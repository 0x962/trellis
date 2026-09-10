import { expect, test } from "@playwright/test";
import { createTicket, ensureProject, moveTicket } from "./cli";
import { cardOf, columnOf, signIn } from "./support";

// Sixteen Todo cards are taller than a 900 px board, so Todo overflows and
// the other columns do not.
test.beforeAll(() => {
	if (!ensureProject("BRD", "Board layout")) return;
	for (let n = 1; n <= 16; n++) createTicket("BRD", `Fill the Todo column past the board height ${n}`);
	createTicket("BRD", "Keep one ticket in progress");
	moveTicket("BRD-17", "in-progress");
});

// A flex column shrinks its children when its content overflows. A header
// that shrinks puts the column name higher than in the other columns. Each
// column is a section with its header and a card list that scrolls, so the
// overflow shows on the Todo list.
test("every column name sits at the same height when one column overflows", async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await signIn(page, "/p/BRD/board");
	await expect(cardOf(columnOf(page, "Todo"), "BRD-1")).toBeVisible();
	await expect(cardOf(columnOf(page, "In Progress"), "BRD-17")).toBeVisible();
	const todo = columnOf(page, "Todo");
	expect(await todo.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
	const names = await page
		.locator("section[data-category] h2")
		.evaluateAll((headings) =>
			headings.map((heading) => `${heading.textContent} ${Math.round(heading.getBoundingClientRect().top)}`),
		);
	const top = names[0]!.split(" ").pop();
	expect(names).toEqual(names.map((name) => name.replace(/\d+$/, top!)));
});
