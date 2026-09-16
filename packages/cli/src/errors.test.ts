import { describe, expect, test } from "bun:test";
import { ORPCError } from "@orpc/client";
import { errors } from "@trellis/api";
import { formatError } from "./errors.ts";

// The server puts the issue sentences into the top-level message, so the
// stderr line must not print the same words twice.
const validationError = (message: string, issues: Array<{ message: string; path?: Array<string | number> }>) =>
	new ORPCError("INPUT_VALIDATION_FAILED", {
		defined: true,
		status: errors.INPUT_VALIDATION_FAILED.status,
		message,
		data: { issues },
	});

describe("the INPUT_VALIDATION_FAILED line", () => {
	test("a rule sentence prints once", () => {
		const sentence = "Reopen the ticket before you assign an agent.";
		const line = formatError(validationError(sentence, [{ message: sentence, path: ["ticket"] }]));
		expect(line).toBe(`error: ${sentence} (INPUT_VALIDATION_FAILED)`);
		expect(line.indexOf("Reopen the ticket")).toBe(line.lastIndexOf("Reopen the ticket"));
	});

	test("a schema failure prints each field once", () => {
		const line = formatError(
			validationError("title: Expected a title. limit: Expected a number.", [
				{ message: "Expected a title.", path: ["title"] },
				{ message: "Expected a number.", path: ["limit"] },
			]),
		);
		expect(line).toBe("error: title: Expected a title. limit: Expected a number. (INPUT_VALIDATION_FAILED)");
	});

	test("an issue the message leaves out still reaches the line", () => {
		const line = formatError(
			validationError(errors.INPUT_VALIDATION_FAILED.message, [{ message: "Expected a title.", path: ["title"] }]),
		);
		expect(line).toBe(
			`error: ${errors.INPUT_VALIDATION_FAILED.message} title: Expected a title. (INPUT_VALIDATION_FAILED)`,
		);
	});
});
