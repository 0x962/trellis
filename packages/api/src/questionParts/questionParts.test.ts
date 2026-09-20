import { describe, expect, test } from "bun:test";
import { questionParts } from "./questionParts.ts";

// OP-52 of section 2, screen 7 in
// docs/research/trellis-for-one-human-and-many-agents.md.
const op52 = [
	"Options:",
	"1. Leave it missed. Write a RoutineRun with a missed state so the person sees the gap.",
	"2. Run it late. The sweep starts every due moment it finds, however old.",
	"3. Run it late inside a wider grace, for example six hours, and leave older moments missed.",
	"",
	"Recommendation: option 1. A night audit that runs at 09:00 reads a different day than the one it",
	"was written for, and a backlog of late runs can hold the CronJob past its next tick.",
].join("\n");

describe("questionParts", () => {
	test("numbers each option and keeps its words", () => {
		const parts = questionParts(op52);

		expect(parts.options).toHaveLength(3);
		expect(parts.options[0]).toEqual({
			number: 1,
			text: "Leave it missed. Write a RoutineRun with a missed state so the person sees the gap.",
		});
		expect(parts.options[2]?.number).toBe(3);
	});

	test("reads the recommended option and joins the paragraph of its reason", () => {
		const parts = questionParts(op52);

		expect(parts.recommendation?.option).toBe(1);
		expect(parts.recommendation?.reason).toBe(
			"A night audit that runs at 09:00 reads a different day than the one it was written for, and a backlog of late runs can hold the CronJob past its next tick.",
		);
	});

	test("takes an option that a bracket closes", () => {
		const parts = questionParts("Options:\n1) Yes\n2) No\n");

		expect(parts.options.map((option) => option.text)).toEqual(["Yes", "No"]);
	});

	test("reports no recommendation when the description names none", () => {
		const parts = questionParts("Options:\n1. Yes\n2. No\n");

		expect(parts.recommendation).toBeNull();
	});

	test("reads no option from a description that lists none", () => {
		const parts = questionParts("Ship the change on Monday.\n");

		expect(parts).toEqual({ options: [], recommendation: null });
	});
});
