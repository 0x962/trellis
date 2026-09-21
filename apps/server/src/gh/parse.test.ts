import { describe, expect, test } from "bun:test";
import { normalizeFiles } from "./parse.ts";

describe("normalizeFiles", () => {
	test("keeps the path and line counts", () => {
		expect(normalizeFiles([{ path: "src/app.ts", changeType: "MODIFIED", additions: 12, deletions: 3 }])).toEqual([
			{ path: "src/app.ts", change: "change", additions: 12, deletions: 3 },
		]);
	});

	test("keeps the Git change type apart from removed lines", () => {
		expect(
			normalizeFiles([
				{ path: "src/old.ts", changeType: "DELETED", additions: 0, deletions: 0 },
				{ path: "src/kept.ts", changeType: "MODIFIED", additions: 0, deletions: 4 },
			]),
		).toEqual([
			{ path: "src/kept.ts", change: "change", additions: 0, deletions: 4 },
			{ path: "src/old.ts", change: "deleted", additions: 0, deletions: 0 },
		]);
	});

	test("sorts files by path", () => {
		expect(
			normalizeFiles([
				{ path: "src/z.ts", changeType: "ADDED", additions: 1, deletions: 0 },
				{ path: "src/a.ts", changeType: "MODIFIED", additions: 2, deletions: 1 },
			]),
		).toEqual([
			{ path: "src/a.ts", change: "change", additions: 2, deletions: 1 },
			{ path: "src/z.ts", change: "new", additions: 1, deletions: 0 },
		]);
	});

	test("keeps at most 100 files", () => {
		const files = Array.from({ length: 101 }, (_, index) => ({
			path: `src/${String(index).padStart(3, "0")}.ts`,
			changeType: "MODIFIED" as const,
			additions: 1,
			deletions: 0,
		}));
		const normalized = normalizeFiles(files);
		expect(normalized).toHaveLength(100);
		expect(normalized.at(-1)?.path).toBe("src/099.ts");
	});
});
