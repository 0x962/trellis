import { expect, test } from "bun:test";
import type { TicketContract } from "@trellis/api";
import { contractInput } from "./contract.ts";
import { contractText } from "./contractText.ts";

const contract: TicketContract = {
	result: "The webhook settles the run row.",
	files: ["backend/operator-service/agent/signals.py", "backend/operator-service/routines/apps.py"],
	leaveAlone: ["routines/views/routine_run.py"],
	verify: ["make check-fix", "pytest routines threads agent"],
	reviewFocus: ["the import direction stays one way", "a chat run looks for no routine run"],
};

test("prints the contract in the ticket layout", () => {
	expect(contractText(contract)).toBe(`THE CONTRACT
 Result         The webhook settles the run row.
 Files          backend/operator-service/agent/signals.py
                backend/operator-service/routines/apps.py
 Leave alone    routines/views/routine_run.py
 Verify         make check-fix
                pytest routines threads agent
 Review focus   the import direction stays one way
                a chat run looks for no routine run
`);
});

test("prints nothing for an empty clause", () => {
	expect(contractText({ result: "Done.", files: [], leaveAlone: [], verify: [], reviewFocus: [] })).toContain(
		" Files          nothing\n Leave alone    nothing\n Verify         nothing\n Review focus   nothing\n",
	);
});

test("accumulates repeated contract flags", () => {
	expect(
		contractInput(
			[
				"OP-34",
				"--result",
				"Done.",
				"--file",
				"a.ts",
				"--file=b.ts",
				"--leave-alone",
				"c.ts",
				"--verify",
				"bun test",
				"--focus",
				"the result stays stable",
			],
			{ ticket: "OP-34", result: "Done." },
		),
	).toEqual({
		ticket: "OP-34",
		result: "Done.",
		files: ["a.ts", "b.ts"],
		leaveAlone: ["c.ts"],
		verify: ["bun test"],
		reviewFocus: ["the result stays stable"],
	});
});
