import { describe, expect, test } from "bun:test";
import { columnSelectionStep } from "./columnSelection";

describe("columnSelectionStep", () => {
	test("keeps the selection while the card sits in the same column", () => {
		expect(columnSelectionStep("todo", "todo", "toggle")).toEqual({ reset: false, action: "toggle" });
		expect(columnSelectionStep("todo", "todo", "extend")).toEqual({ reset: false, action: "extend" });
	});

	test("keeps the selection while no card is selected yet", () => {
		expect(columnSelectionStep(null, "todo", "toggle")).toEqual({ reset: false, action: "toggle" });
		expect(columnSelectionStep(null, "todo", "extend")).toEqual({ reset: false, action: "extend" });
	});

	test("drops the selection for a card of another column", () => {
		expect(columnSelectionStep("todo", "review", "toggle")).toEqual({ reset: true, action: "toggle" });
	});

	test("turns an extend into a toggle for a card of another column", () => {
		expect(columnSelectionStep("todo", "review", "extend")).toEqual({ reset: true, action: "toggle" });
	});
});
