import { expect, test } from "bun:test";
import type { PageCommentThread } from "@trellis/api";
import { numberPageComments, pageCommentPins, pageCommentSearch, visiblePageComments } from "./commentRows";

const thread = (id: string, version: number, resolved: boolean): PageCommentThread => ({
	id,
	pageId: "01M3A9CAWQNFQG4H7BJC0MMA3V",
	version,
	anchor: { kind: "element", path: "main" },
	selectedText: null,
	creator: { kind: "human", name: "Navid" },
	resolved: resolved ? { actor: { kind: "agent", name: "Agent" }, at: "2026-09-25T20:00:00.000Z" } : null,
	comments: [
		{
			id: `${id.slice(0, -1)}A`,
			threadId: id,
			body: "Comment",
			actor: { kind: "human", name: "Navid" },
			createdAt: "2026-09-25T20:00:00.000Z",
			updatedAt: "2026-09-25T20:00:00.000Z",
			deletedAt: null,
		},
	],
	createdAt: "2026-09-25T20:00:00.000Z",
	updatedAt: "2026-09-25T20:00:00.000Z",
});

const first = "01M3D5Q1S0KXJ0BVEHDVFFVMS8";
const second = "01M3D5Q1S0KXJ0BVEHDVFFVMS9";
const third = "01M3D5Q1S0KXJ0BVEHDVFFVMSA";

test("keeps thread numbers stable when resolved rows hide", () => {
	const numbered = numberPageComments([thread(first, 1, false), thread(second, 2, true), thread(third, 2, false)]);
	expect(visiblePageComments(numbered, false).map(({ number }) => number)).toEqual([1, 3]);
	expect(visiblePageComments(numbered, true).map(({ number }) => number)).toEqual([1, 2, 3]);
});

test("draws pins only for visible threads of the viewed version", () => {
	const numbered = numberPageComments([thread(first, 1, false), thread(second, 2, true), thread(third, 2, false)]);
	expect(pageCommentPins(numbered, 2, false).map(({ number }) => number)).toEqual([3]);
	expect(pageCommentPins(numbered, 2, true).map(({ number }) => number)).toEqual([2, 3]);
	expect(pageCommentPins(numbered, 1, false).map(({ number }) => number)).toEqual([1]);
});

test("opens an old thread on its historical version", () => {
	expect(pageCommentSearch(1, 2)).toEqual({ version: 1 });
	expect(pageCommentSearch(2, 2)).toEqual({});
});
