import { describe, expect, test } from "bun:test";
import { readQuestionDescription } from "./readQuestionDescription.ts";

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

describe("readQuestionDescription", () => {
	test("numbers each option and keeps its words", () => {
		const question = readQuestionDescription(op52);

		expect(question.options).toHaveLength(3);
		expect(question.options[0]).toEqual({
			number: 1,
			text: "Leave it missed. Write a RoutineRun with a missed state so the person sees the gap.",
		});
		expect(question.options[2]?.number).toBe(3);
	});

	test("reads the recommended option and joins the paragraph of its reason", () => {
		const question = readQuestionDescription(op52);

		expect(question.recommendation?.option).toBe(1);
		expect(question.recommendation?.reason).toBe(
			"A night audit that runs at 09:00 reads a different day than the one it was written for, and a backlog of late runs can hold the CronJob past its next tick.",
		);
	});

	test("stops the option list at the first blank line", () => {
		const question = readQuestionDescription(
			[
				"Options:",
				"1. Leave it missed.",
				"2. Run it late.",
				"",
				"Recommendation: option 1. Two reasons:",
				"1. A late run reads the wrong day.",
				"2. A backlog holds the next tick.",
			].join("\n"),
		);

		expect(question.options.map((option) => option.text)).toEqual(["Leave it missed.", "Run it late."]);
	});

	test("takes the first option from the heading line", () => {
		const question = readQuestionDescription("Options: 1. Yes\n2. No\n");

		expect(question.options.map((option) => option.text)).toEqual(["Yes", "No"]);
	});

	test("takes an option that a bracket closes", () => {
		const question = readQuestionDescription("Options:\n1) Yes\n2) No\n");

		expect(question.options.map((option) => option.text)).toEqual(["Yes", "No"]);
	});

	test("keeps the numbers the description prints, with no gap filled", () => {
		const question = readQuestionDescription("Options:\n1. Yes\n2. No\n5. Later\n");

		expect(question.options.map((option) => option.number)).toEqual([1, 2, 5]);
	});

	test("reports no recommendation when the description names none", () => {
		expect(readQuestionDescription("Options:\n1. Yes\n2. No\n").recommendation).toBeNull();
	});

	test("reads no option from a description that opens no list", () => {
		expect(readQuestionDescription("Ship the change on Monday.\n")).toEqual({
			options: [],
			recommendation: null,
		});
	});
});
