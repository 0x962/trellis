import { expect, test } from "bun:test";
import type { PullRequestDiffInput } from "@trellis/api";
import { writeDiff } from "./writeDiff.ts";

const cursor = `${"a".repeat(64)}:11`;

const pages = (calls: PullRequestDiffInput[]) => async (input: PullRequestDiffInput) => {
	calls.push(input);
	return input.cursor === undefined
		? { diff: "first-file\n", nextCursor: cursor }
		: { diff: "€second-file\n", nextCursor: null };
};

test("writeDiff writes every page in file order", async () => {
	const calls: PullRequestDiffInput[] = [];
	let output = "";

	await writeDiff({ write: (text) => (output += text) }, false, pages(calls), "01PR");

	expect(calls).toEqual([{ id: "01PR" }, { id: "01PR", cursor }]);
	expect(output).toBe("first-file\n€second-file\n");
});

test("writeDiff writes one JSON value across all pages", async () => {
	const calls: PullRequestDiffInput[] = [];
	let output = "";

	await writeDiff({ write: (text) => (output += text) }, true, pages(calls), "01PR");

	expect(JSON.parse(output)).toEqual({ diff: "first-file\n€second-file\n" });
});
