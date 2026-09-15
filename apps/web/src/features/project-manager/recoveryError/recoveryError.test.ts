import { expect, test } from "bun:test";
import { ORPCError } from "@orpc/client";
import { recoveryError } from "./recoveryError";

test("recovery shows the API validation reason", () => {
	const error = new ORPCError("INPUT_VALIDATION_FAILED", {
		message: "The input does not match the schema.",
		data: { issues: [{ message: "The assignment changed. Read its current identity.", path: ["terminalId"] }] },
	});
	expect(recoveryError(error)).toBe("The assignment changed. Read its current identity.");
});
test("recovery preserves network errors and an absent error", () => {
	expect(recoveryError(new Error("Network request failed"))).toBe("Network request failed");
	expect(recoveryError(null)).toBeUndefined();
});
