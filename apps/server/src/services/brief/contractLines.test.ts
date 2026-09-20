import { expect, test } from "bun:test";
import { contractLines } from "./contractLines.ts";

test("prints every contract clause in a fixed order", () => {
	expect(
		contractLines({
			result: "The webhook settles the run row.",
			files: ["agent/signals.py", "routines/services/run.py"],
			leaveAlone: ["routines/views/run.py, OP-32 owns it"],
			verify: ["pytest routines", "make check"],
			reviewFocus: ["The import direction stays one way."],
		}),
	).toEqual([
		"## Contract",
		"",
		"- Result: The webhook settles the run row.",
		"- Files:",
		"  - agent/signals.py",
		"  - routines/services/run.py",
		"- Leave alone:",
		"  - routines/views/run.py, OP-32 owns it",
		"- Verify:",
		"  - pytest routines",
		"  - make check",
		"- Review focus:",
		"  - The import direction stays one way.",
	]);
});

test("names every contract clause that the ticket does not set", () => {
	expect(contractLines({ result: "", files: [], leaveAlone: [], verify: [], reviewFocus: [] })).toEqual([
		"## Contract",
		"",
		"- Result: nothing",
		"- Files:",
		"  - nothing",
		"- Leave alone:",
		"  - nothing",
		"- Verify:",
		"  - nothing",
		"- Review focus:",
		"  - nothing",
	]);
});
