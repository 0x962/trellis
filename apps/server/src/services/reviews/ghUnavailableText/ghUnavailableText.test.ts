import { expect, test } from "bun:test";
import { ghUnavailableText } from "./ghUnavailableText.ts";

test("a gh failure reads as a sentence and keeps the first line of gh output", () => {
	expect(ghUnavailableText("gh: Not Found (HTTP 404)\nUsage: gh pr view [<number>]\n")).toBe(
		"gh could not read the pull request. gh: Not Found (HTTP 404)",
	);
});

test("a gh failure with no output reads as one sentence", () => {
	expect(ghUnavailableText("")).toBe("gh could not read the pull request.");
});
