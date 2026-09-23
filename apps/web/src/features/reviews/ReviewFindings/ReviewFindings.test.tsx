import { expect, test } from "bun:test";
import type { ReviewThread } from "@trellis/api";
import { renderToStaticMarkup } from "react-dom/server";
import { findingGroups } from "./findingGroups";
import { ReviewFindings } from "./ReviewFindings";

const thread = (fields: Partial<ReviewThread>): ReviewThread =>
	({
		id: "t1",
		prId: "01M2ZWN8R3YRYK14SQD0YHV5TG",
		path: "backend/briefing.py",
		side: "new",
		line: 52,
		startLine: 52,
		revisionId: "head",
		body: "This call has no timeout.",
		author: "backend-checks",
		kind: "agent",
		session: null,
		status: "open",
		createdAt: "2026-09-23T00:19:19.318Z",
		updatedAt: "2026-09-23T00:19:19.318Z",
		version: 1,
		resolvedAt: null,
		resolvedBy: null,
		replies: [],
		reactions: [],
		...fields,
	}) as ReviewThread;

const resolved = thread({
	id: "t2",
	status: "resolved",
	resolvedBy: "01M35RBM7RGTN8KDY2CNM9DXDS",
	resolvedAt: "2026-09-23T00:35:42.808Z",
	body: "The name says nothing.",
});

const earlier = thread({
	id: "t3",
	revisionId: "older",
	createdAt: "2026-09-22T09:00:00.000Z",
	body: "This migration has no reverse.",
	author: "migration-review",
});

const render = (threads: ReviewThread[]) =>
	renderToStaticMarkup(<ReviewFindings threads={threads} revisionId="head" onOpen={() => {}} />);

test("names the author, the file, the line and the words of each open finding", () => {
	const html = render([thread({})]);

	expect(html).toContain("backend-checks");
	expect(html).toContain("backend/briefing.py:52");
	expect(html).toContain("This call has no timeout.");
	expect(html).toContain("Open");
});

test("folds a resolved finding away and names who resolved it", () => {
	const html = render([thread({}), resolved]);

	expect(html).toContain("Show 1 resolved");
	expect(html).not.toContain("The name says nothing.");
});

test("keeps a finding of an earlier revision, in its own group", () => {
	const html = render([thread({}), earlier]);

	expect(html).toContain("This revision");
	expect(html).toContain("An earlier revision");
	expect(html).toContain("This migration has no reverse.");
});

test("says so when the pull request holds no finding", () => {
	expect(render([])).toContain("No findings");
});

test("puts the revision on screen first, then the earlier revisions by their newest finding", () => {
	const older = thread({ id: "t4", revisionId: "oldest", createdAt: "2026-09-20T09:00:00.000Z" });
	const groups = findingGroups([older, earlier, thread({})], "head");

	expect(groups.map((group) => group.revisionId)).toEqual(["head", "older", "oldest"]);
});

test("counts an open and a resolved finding of one revision apart", () => {
	const [group] = findingGroups([thread({}), resolved], "head");

	expect(group!.open.map((one) => one.id)).toEqual(["t1"]);
	expect(group!.resolved.map((one) => one.id)).toEqual(["t2"]);
});
