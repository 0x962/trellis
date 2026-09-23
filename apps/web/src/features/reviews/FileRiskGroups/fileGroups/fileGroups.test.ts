import { expect, test } from "bun:test";
import type { ReadMarkFile } from "../../readMarks/readMarks";
import { collapsedDefaults, fileGroups, groupedPaths } from "./fileGroups";

const file = (path: string, over: Partial<ReadMarkFile> = {}): ReadMarkFile => ({
	path,
	change: "change",
	additions: 10,
	deletions: 2,
	binary: false,
	digest: path,
	...over,
});

const files: ReadMarkFile[] = [
	file("apps/server/drizzle/0083_waits.sql", { change: "new", additions: 11, deletions: 0 }),
	file("apps/web/src/features/reviews/ReviewPage/ReviewPage.tsx", { additions: 20, deletions: 4 }),
	file("apps/web/src/features/reviews/ReviewPage/ReviewPage.test.tsx", { change: "new", additions: 30, deletions: 0 }),
	file("bun.lock", { additions: 2, deletions: 2 }),
];

const pathsOf = (key: string) =>
	fileGroups("trellis", files)
		.find((group) => group.key === key)!
		.files.map((entry) => entry.path);

test("the four groups come back in the order the reviewer reads them", () => {
	expect(fileGroups("trellis", files).map((group) => group.key)).toEqual(["risk", "behavior", "tests", "noise"]);
});

test("the group of every path comes from the path rules", () => {
	expect(pathsOf("risk")).toEqual(["apps/server/drizzle/0083_waits.sql"]);
	expect(pathsOf("behavior")).toEqual(["apps/web/src/features/reviews/ReviewPage/ReviewPage.tsx"]);
	expect(pathsOf("tests")).toEqual(["apps/web/src/features/reviews/ReviewPage/ReviewPage.test.tsx"]);
	expect(pathsOf("noise")).toEqual(["bun.lock"]);
});

test("a row carries the change, the line counts and the reasons of its file", () => {
	const row = fileGroups("trellis", files).find((group) => group.key === "noise")!.files[0]!;

	expect(row).toEqual({
		path: "bun.lock",
		change: "change",
		additions: 2,
		deletions: 2,
		binary: false,
		reasons: ["dependency"],
	});
});

test("a binary file keeps its binary mark", () => {
	const groups = fileGroups("trellis", [file("apps/web/public/logo.png", { change: "new", binary: true })]);

	expect(groups.find((group) => group.key === "behavior")!.files[0]!.binary).toBe(true);
});

// `prRiskReasons` ranks a secret above auth, auth above a migration, and a
// migration above a dependency.
test("the risk group puts the file with the strongest reason first", () => {
	const groups = fileGroups("trellis", [
		file("apps/server/package.json"),
		file("apps/server/src/auth/session.ts"),
		file("apps/server/drizzle/0083_waits.sql"),
		file("apps/server/.env.example"),
	]);

	expect(groups.find((group) => group.key === "risk")!.files.map((entry) => entry.path)).toEqual([
		"apps/server/.env.example",
		"apps/server/src/auth/session.ts",
		"apps/server/drizzle/0083_waits.sql",
		"apps/server/package.json",
	]);
});

test("the flattened paths run group by group, so the diff draws the same order", () => {
	expect(groupedPaths(fileGroups("trellis", files))).toEqual([
		"apps/server/drizzle/0083_waits.sql",
		"apps/web/src/features/reviews/ReviewPage/ReviewPage.tsx",
		"apps/web/src/features/reviews/ReviewPage/ReviewPage.test.tsx",
		"bun.lock",
	]);
});

test("Noise is the one group that starts collapsed", () => {
	expect(collapsedDefaults).toEqual(["noise"]);
});
