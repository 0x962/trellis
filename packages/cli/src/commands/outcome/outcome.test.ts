import { expect, test } from "bun:test";
import { outcomeInput, steLines } from "./outcome.ts";

test("maps the text and expected version flags to the outcome input", () => {
	expect(
		outcomeInput({ ticket: "OP-32", "expect-version": "7" }, "The ticket stores one outcome."),
	).toEqual({
		ticket: "OP-32",
		outcome: "The ticket stores one outcome.",
		expectedVersion: 7,
	});
});

test("prints each STE refusal with the refused prefix", () => {
	const text = `${Array.from({ length: 26 }, () => "word").join(" ")}.`;
	const report = steLines(text);
	expect(report.refusals).toContain("refused  sentence 1 is 26 words. The limit is 25.");
	expect(report.warnings).toEqual([]);
});

test("prints each STE warning with the warn prefix", () => {
	expect(steLines("The result is stored by Trellis.")).toEqual({
		refusals: [],
		warnings: ['warn     sentence 1 is passive: "is stored by". Name the actor.'],
	});
});

test("accepts a short active sentence", () => {
	expect(steLines("Trellis stores one outcome sentence.")).toEqual({ refusals: [], warnings: [] });
});
