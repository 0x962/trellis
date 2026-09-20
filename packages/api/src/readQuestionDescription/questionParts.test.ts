import { describe, expect, test } from "bun:test";
import { questionParts } from "./questionParts.ts";

describe("questionParts", () => {
	test("keeps the prose outside the option list and the recommendation paragraph as the ask", () => {
		const description = [
			"Options:",
			"1. Leave it missed.",
			"2. Run it late.",
			"",
			"Recommendation: option 1. A night audit reads a different day.",
			"A backlog of late runs holds the CronJob.",
			"",
			"start_due skips a due moment older than GRACE.",
		].join("\n");
		expect(questionParts(description)).toEqual({
			ask: "start_due skips a due moment older than GRACE.",
			options: [
				{ number: 1, text: "Leave it missed." },
				{ number: 2, text: "Run it late." },
			],
			recommendation: {
				option: 1,
				reason: "A night audit reads a different day. A backlog of late runs holds the CronJob.",
			},
		});
	});

	test("gives an empty ask when the description holds only the options and the recommendation", () => {
		const description = ["Options:", "1. Leave it missed.", "", "Recommendation: option 1. It shows the gap."].join(
			"\n",
		);
		expect(questionParts(description).ask).toBe("");
	});

	test("gives the whole description as the ask when it lists no option", () => {
		expect(questionParts("Store the cron expression of a routine.")).toEqual({
			ask: "Store the cron expression of a routine.",
			options: [],
			recommendation: null,
		});
	});
});
