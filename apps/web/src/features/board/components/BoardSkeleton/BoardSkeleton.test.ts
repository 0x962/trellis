import { expect, test } from "bun:test";

// A Kanban card draws no top edge. BoardCard/BoardCard.tsx opens its top with
// `border-x border-b`, and the placeholder card here has to match it, or the
// board draws a line above every card until the tickets arrive.
test("the placeholder card opens its top edge like a real board card", async () => {
	const source = await Bun.file(new URL("./BoardSkeleton.tsx", import.meta.url)).text();
	const card = source.match(/className="([^"]*\bh-19\b[^"]*)"/)?.[1];
	expect(card).toBeDefined();
	const utilities = card!.split(/\s+/);
	expect(utilities).not.toContain("border");
	expect(utilities).not.toContain("border-t");
	expect(utilities).toContain("border-x");
	expect(utilities).toContain("border-b");
});
