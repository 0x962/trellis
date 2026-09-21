import { describe, expect, test } from "bun:test";
import type { TicketSummary } from "@trellis/api";
import { readyLine } from "./readyLine";

type Dependency = TicketSummary["waitsOn"][number];

const dependency = (fields: Partial<Dependency>): Dependency => ({
	identifier: "OP-32",
	title: "Service: A routine run opens a chat and queues the turn",
	status: "review",
	isQuestion: false,
	...fields,
});

describe("readyLine", () => {
	test("says yes when no ticket holds the work back", () => {
		expect(readyLine([])).toBe("yes. No ticket holds this one back.");
	});

	test("names the one ticket that holds the work back", () => {
		expect(readyLine([dependency({})])).toBe("no. OP-32 is not merged.");
	});

	test("says open for a question and not merged for a ticket", () => {
		const waitsOn = [dependency({}), dependency({ identifier: "OP-52", isQuestion: true })];

		expect(readyLine(waitsOn)).toBe("no. OP-32 is not merged, and OP-52 is open.");
	});

	test("puts a comma before the last of three reasons", () => {
		const waitsOn = [
			dependency({}),
			dependency({ identifier: "OP-40" }),
			dependency({ identifier: "OP-52", isQuestion: true }),
		];

		expect(readyLine(waitsOn)).toBe("no. OP-32 is not merged, OP-40 is not merged, and OP-52 is open.");
	});
});
