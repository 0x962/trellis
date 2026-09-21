import { expect, test } from "bun:test";
import type { ReadMarkFile } from "../../readMarks/readMarks";
import { collapsedDefaults, fileGroups } from "./fileGroups";

const files: ReadMarkFile[] = [
	{ path: "apps/server/drizzle/0083_waits.sql", change: "new", additions: 11, deletions: 0 },
	{ path: "apps/web/src/features/reviews/ReviewPage/ReviewPage.tsx", change: "change", additions: 20, deletions: 4 },
	{ path: "apps/web/src/features/reviews/ReviewPage/ReviewPage.test.tsx", change: "new", additions: 30, deletions: 0 },
	{ path: "bun.lock", change: "change", additions: 2, deletions: 2 },
];

const nothingRead: ReadonlySet<string> = new Set();

const pathsOf = (key: string, read = nothingRead) =>
	fileGroups("trellis", files, read)
		.find((group) => group.key === key)!
		.files.map((file) => file.path);

test("the four groups come back in the order the reviewer reads them", () => {
	expect(fileGroups("trellis", files, nothingRead).map((group) => group.key)).toEqual([
		"risk",
		"behavior",
		"tests",
		"noise",
	]);
});

test("the group of every path comes from the path rules", () => {
	expect(pathsOf("risk")).toEqual(["apps/server/drizzle/0083_waits.sql"]);
	expect(pathsOf("behavior")).toEqual(["apps/web/src/features/reviews/ReviewPage/ReviewPage.tsx"]);
	expect(pathsOf("tests")).toEqual(["apps/web/src/features/reviews/ReviewPage/ReviewPage.test.tsx"]);
	expect(pathsOf("noise")).toEqual(["bun.lock"]);
});

test("a row carries the change, the line counts and the read mark of its file", () => {
	const row = fileGroups("trellis", files, new Set(["bun.lock"])).find((group) => group.key === "noise")!.files[0]!;

	expect(row).toEqual({ path: "bun.lock", change: "change", additions: 2, deletions: 2, read: true });
});

test("a file that carries no mark reads as unread", () => {
	const rows = fileGroups("trellis", files, new Set(["bun.lock"])).flatMap((group) => group.files);

	expect(rows.filter((row) => row.read)).toHaveLength(1);
});

test("Noise is the one group that starts collapsed", () => {
	expect(collapsedDefaults).toEqual(["noise"]);
});
