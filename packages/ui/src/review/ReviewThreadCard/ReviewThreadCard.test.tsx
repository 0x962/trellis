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

test("keeps the thread address separate from the root message address", () => {
	const html = render({
		thread: { ...thread, id: "message-1", threadId: "thread-1" },
		anchorAction: <button type="button">Open anchor</button>,
		canChange: (id) => id === "message-1",
		onDelete: async () => {},
	});

	expect(html).toContain('id="thread-thread-1"');
	expect(html).toContain("Open anchor");
	expect(html).toContain("This call has no timeout.");
	expect(html).toContain('aria-label="Edit message"');
	expect(html).toContain('aria-label="Delete thread"');
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

test("the one line of a resolved thread carries the reopen button", () => {
	const html = render({ thread: { ...thread, status: "resolved", resolvedBy: "01M35RBM" } });

	expect(html).toContain('aria-label="Reopen comment"');
});

test("the one line of an open outdated thread offers no reopen", () => {
	const html = render({ outdated: { lines: [] } });

	expect(html).not.toContain('aria-label="Reopen comment"');
});

test("a thread resolved a moment ago names no resolver until the server does", () => {
	const html = render({ thread: { ...thread, status: "resolved", resolvedBy: null } });

	expect(html).toContain("Resolved ·");
	expect(html).not.toContain("Resolved by");
});

test("a read-only thread disables its reply and resolve controls", () => {
	const html = render({ readOnly: true, submitRepliesOnEnter: true });

	expect(html).toContain(">Reply</label>");
	expect(html).toContain('aria-label="Post reply"');
	expect(html).toContain('aria-label="Resolve comment"');
	expect(html.match(/disabled=""/g)?.length).toBeGreaterThanOrEqual(3);
});
