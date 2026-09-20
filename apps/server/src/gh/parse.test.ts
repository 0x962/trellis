import { describe, expect, test } from "bun:test";
import { normalizeFiles } from "./parse.ts";

describe("normalizeFiles", () => {
	test("keeps the path and line counts", () => {
		expect(normalizeFiles([{ path: "src/app.ts", additions: 12, deletions: 3 }])).toEqual([
			{ path: "src/app.ts", additions: 12, deletions: 3 },
		]);
	});

	test("sorts files by path", () => {
		expect(
			normalizeFiles([
				{ path: "src/z.ts", additions: 1, deletions: 0 },
				{ path: "src/a.ts", additions: 2, deletions: 1 },
			]),
		).toEqual([
			{ path: "src/a.ts", additions: 2, deletions: 1 },
			{ path: "src/z.ts", additions: 1, deletions: 0 },
		]);
	});
});
