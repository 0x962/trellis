import { describe, expect, test } from "bun:test";
import type { Resource, TicketContract } from "@trellis/api";
import { namedResources, stepOf, ticketText } from "./namedResources";

const emptyContract: TicketContract = { result: "", files: [], leaveAlone: [], verify: [], reviewFocus: [] };

const base = {
	epicId: "01M2YRWY0TEG6ETHHWRHVDQ5AH",
	body: null,
	url: null,
	blob: null,
	ticketId: null,
	pullRequestNumber: null,
	actor: { name: "crisp-fjord", kind: "agent" as const },
	createdAt: "2026-09-19T10:00:00.000Z",
	updatedAt: "2026-09-19T10:00:00.000Z",
};

const resource = (id: string, name: string): Resource => ({ ...base, id, kind: "doc", name, body: "# The runtime" });

const runtime = resource("01AAAAAAAAAAAAAAAAAAAAAAA1", "routine-runtime.md");
const plan = resource("01AAAAAAAAAAAAAAAAAAAAAAA2", "plan");
const picture = resource("01AAAAAAAAAAAAAAAAAAAAAAA3", "op27-send-timeout.gif");

describe("ticketText", () => {
	test("holds the ask and the five clauses of the contract, in lower case", () => {
		const text = ticketText("Step 6 of the Routine runtime.", {
			result: "The settle sequence lives in ONE service.",
			files: ["routines/services/run/run.py"],
			leaveAlone: ["routines/views/routine_run.py"],
			verify: ["pytest Routines"],
			reviewFocus: ["the import direction stays one way"],
		});

		expect(text).toContain("step 6 of the routine runtime.");
		expect(text).toContain("the settle sequence lives in one service.");
		expect(text).toContain("routines/services/run/run.py");
		expect(text).toContain("routines/views/routine_run.py");
		expect(text).toContain("pytest routines");
		expect(text).toContain("the import direction stays one way");
	});
});

describe("stepOf", () => {
	test("reads the step that opens the ask", () => {
		expect(stepOf("Step 6 of the routine runtime. Design: routine-runtime.md.")).toBe("step 6");
	});

	test("reads no step from a sentence in the middle of the ask", () => {
		expect(stepOf("The sweep runs once. Do not repeat step 3 here.")).toBeNull();
	});

	test("reads no step from an ask that names none", () => {
		expect(stepOf("The settle sequence moves behind one service call.")).toBeNull();
	});
});

describe("namedResources", () => {
	const named = (description: string, contract: TicketContract = emptyContract, list = [runtime, plan, picture]) =>
		namedResources(list, ticketText(description, contract)).map((found) => found.name);

	test("follows the ticket that writes the file name", () => {
		expect(named("Step 6 of the routine runtime. Design: routine-runtime.md.")).toEqual(["routine-runtime.md"]);
	});

	test("follows the ticket that writes the file inside a path", () => {
		expect(named("Read `docs/routine-runtime.md` before the first step.")).toEqual(["routine-runtime.md"]);
	});

	test("leaves the resource whose name is a word of a sentence", () => {
		expect(named("Read the plan first.", { ...emptyContract, result: "The plan holds seven steps." })).toEqual([]);
	});

	test("leaves the file whose name is one part of a longer word", () => {
		expect(named("The agent wrote routine-runtime.md.backup by mistake.")).toEqual([]);
	});

	test("reads the name in any case", () => {
		expect(named("The design is OP27-Send-Timeout.GIF.")).toEqual(["op27-send-timeout.gif"]);
	});

	test("finds a file that a contract clause names", () => {
		expect(named("The ask names no file.", { ...emptyContract, files: ["routine-runtime.md"] })).toEqual([
			"routine-runtime.md",
		]);
	});
});
