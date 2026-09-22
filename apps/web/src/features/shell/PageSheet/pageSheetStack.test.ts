import { expect, test } from "bun:test";
import { pageSheetBaseWidth, pageSheetStackWidth, pageSheetStripTarget } from "./pageSheetStack";

const panel = (left: number, right: number) =>
	({
		getBoundingClientRect: () => ({ left, right }),
	}) as unknown as HTMLElement;

test("the first sheet keeps its own width", () => {
	expect(pageSheetStackWidth(pageSheetBaseWidth("page"), 0)).toBe("var(--page-sheet-width)");
	expect(pageSheetStackWidth(pageSheetBaseWidth("wide"), 0)).toBe("var(--page-sheet-wide-width)");
});

test("each sheet over another sheet loses one stack step", () => {
	expect(pageSheetStackWidth("var(--page-sheet-width)", 1)).toBe(
		"max(var(--page-sheet-stack-min-width), calc(var(--page-sheet-width) - var(--page-sheet-stack-step)))",
	);
	expect(pageSheetStackWidth("var(--page-sheet-width)", 2)).toBe(
		"max(var(--page-sheet-stack-min-width), calc(var(--page-sheet-width) - var(--page-sheet-stack-step) - var(--page-sheet-stack-step)))",
	);
});

test("a strip click returns to the deepest sheet under the pointer", () => {
	const stack = [
		{ depth: 0, panel: panel(200, 1000), returnTo: () => {} },
		{ depth: 1, panel: panel(248, 1000), returnTo: () => {} },
		{ depth: 2, panel: panel(296, 1000), returnTo: () => {} },
	];

	expect(pageSheetStripTarget(stack, 220)?.depth).toBe(0);
	expect(pageSheetStripTarget(stack, 260)?.depth).toBe(1);
	expect(pageSheetStripTarget(stack, 320)?.depth).toBe(2);
	expect(pageSheetStripTarget(stack, 120)).toBe(null);
});
