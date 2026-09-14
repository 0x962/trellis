import { expect, test } from "bun:test";
import { parseFlowDecision } from "./parseFlowDecision.ts";

test("only a whole YES or NO answer controls a branch", () => {
	expect(parseFlowDecision(" YES\n")).toBe("yes");
	expect(parseFlowDecision("no")).toBe("no");
	for (const output of ["", "YES, but only if tests pass", "The answer is YES", "YES\nNO", '{"decision":"yes"}'])
		expect(parseFlowDecision(output)).toBeNull();
});
