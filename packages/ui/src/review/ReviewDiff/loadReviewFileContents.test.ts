import { describe, expect, mock, test } from "bun:test";
import { loadReviewFileContents } from "./loadReviewFileContents";
import type { ReviewFile } from "./parseReviewFiles";

const file = (overrides: Partial<ReviewFile> = {}): ReviewFile => ({
	name: "src/current.ts",
	type: "change",
	deletionLines: [],
	additionLines: [],
	hunks: [],
	...overrides,
});

describe("loadReviewFileContents", () => {
	// Expanding a changed file reads both sides at once through one call.
	test("loads the old and new contents of a changed file", async () => {
		const loadFile = mock(async (path: string, side: "old" | "new") => `${side}:${path}`);
		const contents = await loadReviewFileContents(loadFile, file());
		expect(loadFile).toHaveBeenCalledTimes(2);
		expect(loadFile).toHaveBeenCalledWith("src/current.ts", "old");
		expect(loadFile).toHaveBeenCalledWith("src/current.ts", "new");
		expect(contents).toEqual({ oldLines: ["old:src/current.ts"], newLines: ["new:src/current.ts"] });
	});

	// A renamed file keeps its history under the previous name.
	test("reads the old side under the previous name", async () => {
		const loadFile = mock(async (path: string, side: "old" | "new") => `${side}:${path}`);
		const contents = await loadReviewFileContents(
			loadFile,
			file({ type: "rename-changed", prevName: "src/previous.ts" }),
		);
		expect(loadFile).toHaveBeenCalledWith("src/previous.ts", "old");
		expect(contents.oldLines).toEqual(["old:src/previous.ts"]);
	});

	// A new file has no old side and a deleted file has no new side.
	test("skips the missing side of a new or deleted file", async () => {
		const loadFile = mock(async (path: string) => path);
		expect(await loadReviewFileContents(loadFile, file({ type: "new" }))).toEqual({
			newLines: ["src/current.ts"],
		});
		expect(loadFile).toHaveBeenCalledTimes(1);
		const reload = mock(async (path: string) => path);
		expect(await loadReviewFileContents(reload, file({ type: "deleted" }))).toEqual({
			oldLines: ["src/current.ts"],
		});
		expect(reload).toHaveBeenCalledTimes(1);
	});

	// A trailing newline ends the last line instead of starting an empty one.
	test("drops the empty line a trailing newline leaves", async () => {
		const loadFile = mock(async () => "one\ntwo\n");
		const contents = await loadReviewFileContents(loadFile, file());
		expect(contents).toEqual({ oldLines: ["one", "two"], newLines: ["one", "two"] });
	});
});
