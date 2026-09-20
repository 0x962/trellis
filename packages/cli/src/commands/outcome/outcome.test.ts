import { expect, test } from "bun:test";
import { outcomeInput, outcomeReport } from "./outcome.ts";

test("maps the text flag to the outcome field", () => {
	expect(outcomeInput("OP-32", "The ticket stores one outcome.")).toEqual({
		ticket: "OP-32",
		outcome: "The ticket stores one outcome.",
	});
});

test("prints each STE refusal in the summary format", () => {
	const text = `${Array.from({ length: 26 }, () => "word").join(" ")}.`;
	const report = outcomeReport(text);
	expect(report.refusals).toContain("refused  sentence 1 is 26 words. The limit is 25.");
	expect(report.warnings).toEqual([]);
});

test("prints each STE warning in the summary format", () => {
	expect(outcomeReport("The result is stored by Trellis.")).toEqual({
		refusals: [],
		warnings: ['warn     sentence 1 is passive: "is stored by". Name the actor.'],
	});
});

test("accepts a short active sentence", () => {
	expect(outcomeReport("Trellis stores one outcome sentence.")).toEqual({ refusals: [], warnings: [] });
});
