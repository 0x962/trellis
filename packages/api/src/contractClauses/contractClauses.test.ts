import { expect, test } from "bun:test";
import { contractClauses } from "./contractClauses.ts";

test("returns the contract clauses in display order", () => {
	expect(
		contractClauses({
			result: "Done.",
			files: ["a.ts"],
			leaveAlone: ["b.ts"],
			verify: ["bun test"],
			reviewFocus: ["Order stays fixed."],
		}),
	).toEqual([
		{ label: "Result", values: ["Done."] },
		{ label: "Files", values: ["a.ts"] },
		{ label: "Leave alone", values: ["b.ts"] },
		{ label: "Verify", values: ["bun test"] },
		{ label: "Review focus", values: ["Order stays fixed."] },
	]);
});

test("returns no value for an empty result", () => {
	expect(contractClauses({ result: "", files: [], leaveAlone: [], verify: [], reviewFocus: [] })[0]).toEqual({
		label: "Result",
		values: [],
	});
});
