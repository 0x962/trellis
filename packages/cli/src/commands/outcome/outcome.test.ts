import { expect, test } from "bun:test";
import { refusalText, steReport, warningText } from "../../steReport.ts";
import { outcomeInput } from "./outcome.ts";

test("maps the text and expected version flags to the outcome input", () => {
	expect(outcomeInput({ ticket: "OP-32", "expect-version": "7" }, "The ticket stores one outcome.")).toEqual({
		ticket: "OP-32",
		outcome: "The ticket stores one outcome.",
		expectedVersion: 7,
	});
});

test("prints each STE refusal with the refused prefix", () => {
	const text = `${Array.from({ length: 26 }, () => "word").join(" ")}.`;
	expect(refusalText([steReport(text, { headline: false })])).toContain(
		"refused  sentence 1 is 26 words. The limit is 25.",
	);
});

test("prints each STE warning with the warn prefix", () => {
	expect(warningText([steReport("The result is stored by Trellis.", { headline: false })])).toBe(
		'warn     sentence 1 is passive: "is stored by". Name the actor.\n',
	);
});

test("accepts a short active sentence", () => {
	const report = steReport("Trellis stores one outcome sentence.", { headline: false });
	expect(`${refusalText([report])}${warningText([report])}`).toBe("");
});
