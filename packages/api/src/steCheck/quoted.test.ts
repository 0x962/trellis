import { describe, expect, test } from "bun:test";
import { unquotedText } from "./quoted";

describe("unquotedText", () => {
	test("masks inline quoted material", () => {
		const result = unquotedText(
			"Keep the user's choice 🚀🚀, `an — example`, \"a — string\", “curly — words”, 'single — words' and ‘more — words’.",
		);
		expect(result).not.toContain("—");
		expect(result).toContain("user's");
		expect(result).toEndWith(".");
	});

	test("masks error lines, check names and test names", () => {
		const result = unquotedText("Error: a — failure\ncheck: type — check\ntest: unit — test\nKeep this line.");
		expect(result).not.toContain("—");
		expect(result).toContain("Keep this line.");
	});

	test("masks paths", () => {
		const result = unquotedText("Open packages/api/src/steCheck/steCheck.ts and ChatPage.vue first.");
		expect(result).toMatch(/^Open\s+and\s+first\.$/);
	});
});
