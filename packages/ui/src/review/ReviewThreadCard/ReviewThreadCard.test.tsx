import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ReviewThreadCard } from "./ReviewThreadCard";

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

// The card reads the reply draft from `localStorage` while it renders, and a
// test run has no browser.
globalThis.localStorage = memoryStorage(new Map());

const thread = {
	id: "t1",
	author: "backend-checks",
	kind: "agent",
	session: null,
	body: "This call has no timeout.\nThe second line stays out of the one line.",
	createdAt: "2026-09-23T00:19:19.318Z",
	version: 1,
	reactions: [],
	replies: [],
	status: "open",
	resolvedBy: null,
};

const render = (props: Partial<Parameters<typeof ReviewThreadCard>[0]>) =>
	renderToStaticMarkup(
		<ReviewThreadCard
			thread={thread}
			renderBody={(body) => <p>{body}</p>}
			onReply={async () => {}}
			onResolve={async () => {}}
			onEdit={async () => {}}
			{...props}
		/>,
	);

test("an open thread of the current diff shows its messages", () => {
	const html = render({});

	expect(html).toContain("This call has no timeout.");
	expect(html).not.toContain("aria-expanded");
});

test("a resolved thread opens as one line with the author, the place and the first words", () => {
	const html = render({
		thread: { ...thread, status: "resolved", resolvedBy: "01M35RBM" },
		anchor: "backend/briefing.py:52",
	});

	expect(html).toContain("Resolved by 01M35RBM");
	expect(html).toContain("backend-checks");
	expect(html).toContain("backend/briefing.py:52");
	expect(html).toContain("This call has no timeout.");
	expect(html).not.toContain("The second line stays out of the one line.");
});

test("an outdated thread opens as one line, above the code it was written against", () => {
	const html = render({ anchor: "backend/briefing.py:52", outdated: { lines: ["def send(self):", "    post()"] } });

	expect(html).toContain("Outdated");
	expect(html).toContain("def send(self):");
	expect(html).not.toContain("The second line stays out of the one line.");
});

test("an outdated thread whose old diff is gone still opens as one line", () => {
	const html = render({ outdated: { lines: [] } });

	expect(html).toContain("Outdated");
	expect(html).not.toContain("review-thread-outdated");
});
