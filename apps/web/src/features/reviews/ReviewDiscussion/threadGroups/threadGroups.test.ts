import { expect, test } from "bun:test";
import type { ReviewThread } from "@trellis/api";
import { threadGroups } from "./threadGroups";

const thread = (id: string, status: ReviewThread["status"], fields: Partial<ReviewThread> = {}): ReviewThread =>
	({ id, status, path: "apps/web/one.ts", author: "navid", body: `Body of ${id}`, ...fields }) as ReviewThread;

const every = [
	thread("resolved-one", "resolved"),
	thread("open-one", "open"),
	thread("resolved-two", "resolved"),
	thread("open-two", "open", { path: "packages/ui/two.ts" }),
];

const all = { status: "all", search: "" };

test("splits the threads into the open ones and the resolved ones", () => {
	const groups = threadGroups(every, all);

	expect(groups.open.map((item) => item.id)).toEqual(["open-one", "open-two"]);
	expect(groups.resolved.map((item) => item.id)).toEqual(["resolved-one", "resolved-two"]);
});

test("keeps the order the server sent inside each group", () => {
	const groups = threadGroups([...every].reverse(), all);

	expect(groups.open.map((item) => item.id)).toEqual(["open-two", "open-one"]);
});

test("the status choice drops the other group", () => {
	expect(threadGroups(every, { status: "open", search: "" }).resolved).toEqual([]);
	expect(threadGroups(every, { status: "resolved", search: "" }).open).toEqual([]);
});

test("the search reads the path, the author and the first message", () => {
	expect(threadGroups(every, { status: "all", search: "packages/ui" }).open.map((item) => item.id)).toEqual([
		"open-two",
	]);
	expect(threadGroups(every, { status: "all", search: "NAVID" }).open).toHaveLength(2);
	expect(threadGroups(every, { status: "all", search: "Body of open-one" }).open.map((item) => item.id)).toEqual([
		"open-one",
	]);
});

test("a search of spaces alone keeps every thread", () => {
	expect(threadGroups(every, { status: "all", search: "   " }).open).toHaveLength(2);
});
