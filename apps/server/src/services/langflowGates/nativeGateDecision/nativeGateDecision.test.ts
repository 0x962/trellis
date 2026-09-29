import { expect, test } from "bun:test";
import { parseFlowDecision } from "../../../agents/nativeFlow/parseFlowDecision.ts";
import { nativeGateDecision } from "./nativeGateDecision.ts";

for (const output of ["YES", "  No\n", "\tYeS\r\n", "no", "", "YES because", "NO\nYES", "```YES```", "yesterday"])
	test(`preserves the complete native answer ${JSON.stringify(output)}`, () => {
		expect(nativeGateDecision({ output, exitKind: "completed" })).toBe(parseFlowDecision(output) ?? "unknown");
	});

for (const exitKind of ["process_error", "timeout", "canceled"] as const)
	test(`a ${exitKind} result cannot supply a decision`, () => {
		expect(nativeGateDecision({ output: "YES", exitKind })).toBe("unknown");
	});
