import { describe, expect, test } from "bun:test";
import { type DepsResult, depsText } from "./depsText.ts";

describe("depsText", () => {
	test("prints the waits, releases, and branch dependency blocks", () => {
		const result: DepsResult = {
			ticket: {
				identifier: "OP-33",
				title: "Service: One routine's failure does not end the sweep pass",
			},
			waitsOn: [
				{
					identifier: "OP-32",
					title: "Service: A routine run opens a chat and queues the turn",
					status: "review",
					isQuestion: false,
				},
				{
					identifier: "OP-52",
					title: "Decision: a missed window, run it late or leave it missed",
					status: "review",
					isQuestion: true,
				},
			],
			releases: [],
			derived: [
				{
					number: 57055,
					baseRef: "nk/operator-routine-execution",
					stackedOn: {
						number: 55569,
						headRef: "nk/operator-routine-execution",
						ticketIdentifier: "OP-32",
					},
				},
			],
		};

		expect(depsText(result)).toBe(`OP-33  Service: One routine's failure does not end the sweep pass
  waits on
    OP-32  Service: A routine run opens a chat and queues the turn    agent review
    OP-52  Decision: a missed window, run it late or leave it missed  human review
  releases
    nothing
  derived
    #57055 is based on nk/operator-routine-execution, the head of #55569 (OP-32)
`);
	});

	test("prints nothing for each empty block", () => {
		expect(
			depsText({
				ticket: { identifier: "OP-43", title: "Canary route" },
				waitsOn: [],
				releases: [],
				derived: [],
			}),
		).toBe(`OP-43  Canary route
  waits on
    nothing
  releases
    nothing
  derived
    nothing
`);
	});

	test("prints each released ticket", () => {
		expect(
			depsText({
				ticket: { identifier: "OP-32", title: "Routine run" },
				waitsOn: [],
				releases: [
					{ identifier: "OP-33", title: "Sweep failure" },
					{ identifier: "OP-34", title: "Queue state" },
				],
				derived: [],
			}),
		).toBe(`OP-32  Routine run
  waits on
    nothing
  releases
    OP-33  Sweep failure
    OP-34  Queue state
  derived
    nothing
`);
	});
});
