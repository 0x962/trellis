import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { FileRiskGroups } from "./FileRiskGroups";
import { fileShape, type ReadMarkFile } from "./readMarks/readMarks";

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

// The component reads the marks from `localStorage` while it renders, and a
// test run has no browser.
const withStorage = (entries: Map<string, string> = new Map()) => {
	globalThis.localStorage = memoryStorage(entries);
};

const pr = "0x962/trellis#161";

const files: ReadMarkFile[] = [
	{ path: "apps/server/drizzle/0083_waits.sql", change: "new", additions: 11, deletions: 0 },
	{ path: "apps/web/src/features/reviews/ReviewPage/ReviewPage.tsx", change: "change", additions: 20, deletions: 4 },
	{ path: "apps/web/src/features/reviews/ReviewPage/ReviewPage.test.tsx", change: "new", additions: 30, deletions: 0 },
	{ path: "bun.lock", change: "change", additions: 2, deletions: 2 },
];

const render = (entries?: Map<string, string>, on = pr) => {
	withStorage(entries);
	return renderToStaticMarkup(<FileRiskGroups pr={on} repo="trellis" files={files} selected="" onSelect={() => {}} />);
};

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

	// React writes the `hidden` attribute on the list the group header controls.
	expect(html).toContain('-noise" hidden');
	expect(html).not.toContain('-risk" hidden');
	expect(html).toContain("Show 1 file");
});

test("the heading counts the files that carry a read mark", () => {
	const html = render();

	expect(html).toContain("0 of 4 read");
});

test("a stored mark whose shape still matches reads as read", () => {
	const marked = files[1]!;
	const html = render(new Map([[`trellis.review.read:${pr}`, JSON.stringify({ [marked.path]: fileShape(marked) })]]));

	expect(html).toContain("1 of 4 read");
	expect(html).toContain(`Mark ${marked.path} read`);
});

test("a stored mark from a revision that changed the file reads as unread", () => {
	const marked = files[1]!;
	const html = render(new Map([[`trellis.review.read:${pr}`, JSON.stringify({ [marked.path]: "change:1:1" })]]));

	expect(html).toContain("0 of 4 read");
});

const groupOf = (html: string, label: string) => {
	const start = html.indexOf(`aria-label="${label} files"`);
	return html.slice(start, start + html.slice(start).indexOf("</section>"));
};

test("the group of every path comes from the path rules", () => {
	const html = render();

	expect(groupOf(html, "Risk")).toContain("apps/server/drizzle/0083_waits.sql");
	expect(groupOf(html, "Behavior")).toContain("apps/web/src/features/reviews/ReviewPage/ReviewPage.tsx");
	expect(groupOf(html, "Tests")).toContain("apps/web/src/features/reviews/ReviewPage/ReviewPage.test.tsx");
	// Noise starts collapsed and a collapsed group draws no row, so its one
	// file shows as the count in the header and as an absence everywhere else.
	expect(groupOf(html, "Noise")).toContain("1 file");
	expect(groupOf(html, "Noise")).toContain("2 lines added, 2 lines deleted");
	for (const label of ["Risk", "Behavior", "Tests"]) expect(groupOf(html, label)).not.toContain("bun.lock");
});

test("a collapsed group draws no row", () => {
	const html = render();

	expect(html).toContain('-noise" hidden=""></ul>');
});

test("each pull request reads its own marks", () => {
	const marked = files[1]!;
	const entries = new Map([[`trellis.review.read:${pr}`, JSON.stringify({ [marked.path]: fileShape(marked) })]]);

	expect(render(entries, pr)).toContain("1 of 4 read");
	expect(render(entries, "0x962/trellis#162")).toContain("0 of 4 read");
});
