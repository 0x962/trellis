import { expect, test } from "@playwright/test";
import { createTicket, ensureProject, moveTicket, trellis } from "./cli";
import { failingPrUrl } from "./ghReplies";
import { cardOf, columnOf, signIn } from "./support";

// Sixteen Todo cards are taller than a 900 px board, so Todo overflows and
// the other columns do not.
test.beforeAll(() => {
	if (!ensureProject("BRD", "Board layout")) return;
	for (let n = 1; n <= 16; n++) createTicket("BRD", `Fill the Todo column past the board height ${n}`);
	createTicket("BRD", "Keep one ticket in progress");
	moveTicket("BRD-17", "in-progress");
	createTicket("BRD", "Keep the card border consistent when checks fail");
	trellis(["pr", "add", "BRD-18", failingPrUrl]);
	createTicket("BRD", "Show the drag preview without a top edge");
});

test("board card states omit the top edge and keep the other edges", async ({ page }) => {
	await signIn(page, "/p/BRD/board");
	await page.evaluate(() => {
		document.documentElement.dataset.theme = "dark";
	});
	const failed = cardOf(page, "BRD-18");
	const ordinary = cardOf(page, "BRD-17");
	await expect(failed).toBeAttached();
	await expect(ordinary).toBeVisible();
	const border = (element: HTMLElement | SVGElement) => {
		const style = getComputedStyle(element);
		return {
			top: style.borderTopWidth,
			right: style.borderRightWidth,
			bottom: style.borderBottomWidth,
			left: style.borderLeftWidth,
			colors: [style.borderRightColor, style.borderBottomColor, style.borderLeftColor],
		};
	};
	const ordinaryBorder = await ordinary.evaluate(border);
	expect(await failed.evaluate(border)).toEqual(ordinaryBorder);
	expect(ordinaryBorder).toMatchObject({ top: "0px", right: "1px", bottom: "1px", left: "1px" });
	await ordinary.hover();
	await expect
		.poll(() => ordinary.evaluate((element) => getComputedStyle(element).boxShadow))
		.toContain("1px 0px 0px 0px");
	const hoverShadow = await ordinary.evaluate((element) => getComputedStyle(element).boxShadow);
	expect(hoverShadow).not.toContain("0px 0px 0px 1px");
	expect(hoverShadow).toContain("1px 0px 0px 0px");
	expect(hoverShadow).toContain("0px 1px 0px 0px");
	expect(hoverShadow).toContain("-1px 0px 0px 0px");

	await page.evaluate(() => {
		const state = window as typeof window & { __cardPreviewVisual?: { border: string; shadow: string } };
		const observer = new MutationObserver(() => {
			const preview = document.querySelector<HTMLElement>("[data-card-preview]");
			if (preview === null) return;
			const style = getComputedStyle(preview);
			state.__cardPreviewVisual = { border: style.borderTopWidth, shadow: style.boxShadow };
			observer.disconnect();
		});
		observer.observe(document.body, { childList: true, subtree: true });
	});
	await cardOf(page, "BRD-19").dragTo(columnOf(page, "In Progress"));
	const preview = await page.evaluate(
		() => (window as typeof window & { __cardPreviewVisual?: { border: string; shadow: string } }).__cardPreviewVisual,
	);
	expect(preview?.border).toBe("0px");
	expect(preview?.shadow).not.toContain("0px 0px 0px 1px");
	expect(preview?.shadow).toContain("1px 0px 0px 0px");
	expect(preview?.shadow).toContain("0px 1px 0px 0px");
	expect(preview?.shadow).toContain("-1px 0px 0px 0px");
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
