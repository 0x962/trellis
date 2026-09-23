import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReadMarkFile } from "../readMarks/readMarks";
import { FileRiskGroups } from "./FileRiskGroups";
import { fileGroups } from "./fileGroups";

const memoryStorage = (entries: Map<string, string>): Storage => ({
	get length() {
		return entries.size;
	},
	clear: () => entries.clear(),
	getItem: (key: string) => entries.get(key) ?? null,
	key: (index: number) => [...entries.keys()][index] ?? null,
	removeItem: (key: string) => entries.delete(key),
	setItem: (key: string, value: string) => entries.set(key, value),
});

// `useCollapsedGroups` reads `localStorage` while the component renders, and a
// test run has no browser.
globalThis.localStorage = memoryStorage(new Map());

const pr = "0x962/trellis#161";

const file = (path: string, over: Partial<ReadMarkFile>): ReadMarkFile => ({
	path,
	change: "change",
	additions: 0,
	deletions: 0,
	binary: false,
	digest: path,
	...over,
});

const groups = fileGroups("trellis", [
	file("apps/server/drizzle/0083_waits.sql", { change: "new", additions: 11 }),
	file("apps/web/src/features/reviews/ReviewPage/ReviewPage.tsx", { additions: 20, deletions: 4 }),
	file("apps/web/src/features/reviews/ReviewPage/ReviewPage.test.tsx", { change: "new", additions: 30 }),
	file("bun.lock", { additions: 2, deletions: 2 }),
]);

// The tree of each group loads from a chunk of its own, so a server render
// draws the group headers and the placeholder of every open group.
const render = (read: ReadonlySet<string> = new Set()) =>
	renderToStaticMarkup(<FileRiskGroups pr={pr} groups={groups} read={read} selected="" onSelect={() => {}} />);

test("the four groups print in the order the reviewer reads them", () => {
	const html = render();

	const order = ["Risk", "Behavior", "Tests", "Noise"].map((label) => html.indexOf(`>${label}<`));
	expect(order.filter((at) => at > -1)).toHaveLength(4);
	expect(order).toEqual([...order].sort((a, b) => a - b));
});

test("each group prints its file count and its line count", () => {
	const html = render();

	expect(html).toContain("1 file");
	expect(html).toContain("11 lines added, 0 lines deleted");
	expect(html).toContain("20 lines added, 4 lines deleted");
});

test("Noise starts collapsed and the other three groups start open", () => {
	const html = render();

	// React writes the `hidden` attribute on the box the group header controls.
	expect(html).toContain('-noise" hidden');
	expect(html).not.toContain('-risk" hidden');
	expect(html).toContain("Show 1 file");
});

test("a collapsed group draws no tree", () => {
	expect(render()).toContain('-noise" hidden="" class="px-3 pb-2 max-md:px-2"></div>');
});

test("the heading counts the files that carry a read mark", () => {
	expect(render()).toContain("0 of 4 read");
	expect(render(new Set(["bun.lock", "apps/web/src/features/reviews/ReviewPage/ReviewPage.tsx"]))).toContain(
		"2 of 4 read",
	);
});
