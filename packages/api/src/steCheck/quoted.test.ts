import { describe, expect, test } from "bun:test";
import { unquotedText } from "./quoted";

describe("unquotedText", () => {
	test("masks inline quoted material", () => {
		const result = unquotedText(
			"Keep `an — example`, \"a — string\", “curly — words”, 'single — words' and ‘more — words’.",
		);
		expect(result).not.toContain("—");
		expect(result).toEndWith(".");
	});

	test("keeps apostrophes in prose", () => {
		expect(unquotedText("The user's choice isn't changed.")).toBe("The user's choice isn't changed.");
	});

	test("masks error lines, check names and test names", () => {
		const result = unquotedText("Error: a — failure\ncheck: type — check\ntest: unit — test\nKeep this line.");
		expect(result).not.toContain("—");
		expect(result).toContain("Keep this line.");
	});

	test("masks paths", () => {
		const result = unquotedText("Open packages/api/src/steCheck/steCheck.ts and ChatPage.vue first.");
		expect(result).not.toContain("steCheck.ts");
		expect(result).not.toContain("ChatPage.vue");
		expect(result).toContain("Open");
		expect(result).toContain("first.");
	});
});
