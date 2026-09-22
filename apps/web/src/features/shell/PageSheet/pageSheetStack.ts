export type PageSheetStackItem = {
	depth: number;
	panel: HTMLElement | null;
	returnTo: () => void;
};

export type PageSheetWidth = "page" | "wide";

export const pageSheetBaseWidth = (width: PageSheetWidth) =>
	width === "page" ? "var(--page-sheet-width)" : "var(--page-sheet-wide-width)";

export const pageSheetStackWidth = (rootWidth: string, depth: number) => {
	if (depth === 0) return rootWidth;
	const stackOffset = Array.from({ length: depth }, () => "var(--page-sheet-stack-step)").join(" - ");
	return `max(var(--page-sheet-stack-min-width), calc(${rootWidth} - ${stackOffset}))`;
};

export const pageSheetStripTarget = (stack: readonly PageSheetStackItem[], clientX: number) => {
	const containing = stack.filter((item) => {
		const rect = item.panel?.getBoundingClientRect();
		return rect !== undefined && rect.left <= clientX && clientX <= rect.right;
	});
	return containing.sort((a, b) => b.depth - a.depth)[0] ?? null;
};
