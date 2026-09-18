import { describe, expect, test } from "bun:test";
import {
	applySuggestionEdits,
	joinFileLines,
	lineEndingOf,
	parseSuggestions,
	splitFileLines,
	splitSuggestionBody,
	suggestionBlock,
	suggestionDiff,
	suggestionEditsOverlap,
} from "./reviewSuggestion";

describe("splitSuggestionBody", () => {
	test("keeps the prose and reads one block", () => {
		expect(splitSuggestionBody("Rename it.\n```suggestion\nconst b = 2;\n```\nThanks.")).toEqual([
			{ kind: "markdown", text: "Rename it." },
			{ kind: "suggestion", lines: ["const b = 2;"] },
			{ kind: "markdown", text: "Thanks." },
		]);
	});

	test("an empty block deletes the lines", () => {
		expect(parseSuggestions("```suggestion\n```")).toEqual([{ lines: [] }]);
	});

	test("accepts Windows line breaks and a longer closing fence", () => {
		expect(parseSuggestions("```suggestion\r\na\r\nb\r\n````")).toEqual([{ lines: ["a", "b"] }]);
	});

	test("a block that never closes is markdown", () => {
		expect(splitSuggestionBody("```suggestion\nnothing")).toEqual([
			{ kind: "markdown", text: "```suggestion\nnothing" },
		]);
	});

	test("two blocks give two suggestions", () => {
		expect(parseSuggestions("```suggestion\none\n```\n\n```suggestion\ntwo\n```")).toEqual([
			{ lines: ["one"] },
			{ lines: ["two"] },
		]);
	});

	test("a plain code block is not a suggestion", () => {
		expect(parseSuggestions("```ts\nconst a = 1;\n```")).toEqual([]);
	});
});

describe("suggestionBlock", () => {
	test("wraps the lines and lengthens the fence past inner backticks", () => {
		expect(suggestionBlock(["a", "```b"])).toBe("````suggestion\na\n```b\n````");
		expect(suggestionBlock([])).toBe("```suggestion\n```");
	});
});

describe("suggestionDiff", () => {
	test("pairs a replaced line and marks the changed token", () => {
		expect(suggestionDiff(["const a = 1;", "return a;"], ["const b = 1;", "return a;"])).toEqual([
			{ type: "deletion", text: "const a = 1;", marks: [[6, 7]] },
			{ type: "addition", text: "const b = 1;", marks: [[6, 7]] },
			{ type: "context", text: "return a;" },
		]);
	});

	test("an uneven change carries no marks", () => {
		expect(suggestionDiff(["a"], ["b", "c"])).toEqual([
			{ type: "deletion", text: "a" },
			{ type: "addition", text: "b" },
			{ type: "addition", text: "c" },
		]);
	});

	test("a deletion has only removed lines", () => {
		expect(suggestionDiff(["a", "b"], [])).toEqual([
			{ type: "deletion", text: "a" },
			{ type: "deletion", text: "b" },
		]);
	});
});

describe("applySuggestionEdits", () => {
	const file = ["one", "two", "three", "four"];

	test("replaces a range and deletes with an empty edit", () => {
		expect(applySuggestionEdits(file, [{ startLine: 2, line: 3, lines: ["2", "3", "3b"] }])).toEqual([
			"one",
			"2",
			"3",
			"3b",
			"four",
		]);
		expect(applySuggestionEdits(file, [{ startLine: 4, line: 4, lines: [] }])).toEqual(["one", "two", "three"]);
	});

	test("applies two edits from the end so both land", () => {
		expect(
			applySuggestionEdits(file, [
				{ startLine: 1, line: 1, lines: ["1", "1b"] },
				{ startLine: 4, line: 4, lines: ["4"] },
			]),
		).toEqual(["1", "1b", "two", "three", "4"]);
	});

	test("finds an overlap", () => {
		expect(
			suggestionEditsOverlap([
				{ startLine: 1, line: 2, lines: [] },
				{ startLine: 2, line: 3, lines: [] },
			]),
		).toBe(true);
		expect(
			suggestionEditsOverlap([
				{ startLine: 1, line: 2, lines: [] },
				{ startLine: 3, line: 3, lines: [] },
			]),
		).toBe(false);
	});
});

describe("file lines", () => {
	test("keeps the line ending and the trailing break", () => {
		const content = "a\r\nb\r\n";
		expect(lineEndingOf(content)).toBe("\r\n");
		expect(splitFileLines(content)).toEqual(["a", "b"]);
		expect(joinFileLines(["a", "c"], "\r\n", true)).toBe("a\r\nc\r\n");
		expect(joinFileLines(["a"], "\n", false)).toBe("a");
	});
});
