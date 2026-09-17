import { describe, expect, test } from "bun:test";
import { ghCopy } from "./ghCopy.ts";
import { GhReasonSchema } from "./schemas/enums.ts";

describe("ghCopy", () => {
	test("every gh reason the contract declares has a line", () => {
		expect(Object.keys(ghCopy).sort()).toEqual([...GhReasonSchema.options].sort());
		for (const [reason, copy] of Object.entries(ghCopy)) {
			expect(copy.line.endsWith("."), reason).toBe(true);
		}
	});

	test("the two reasons a person can fix name the command to run", () => {
		expect(ghCopy.missing.command).toBe("brew install gh");
		expect(ghCopy.unauthenticated.command).toBe("gh auth login");
	});

	// Only the server knows why gh failed, so this reason offers no command.
	test("the error reason has no command", () => {
		expect(ghCopy.error.command).toBeNull();
	});
});
