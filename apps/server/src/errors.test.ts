import { describe, expect, test } from "bun:test";
import { errors } from "@trellis/api";
import { invalidInput, invalidIssues } from "./errors.ts";

// The web and the mobile app show `error.message` and never read
// `data.issues`. So every INPUT_VALIDATION_FAILED carries its own sentence in
// the top-level message, and not the default sentence of the contract.
describe("invalidInput", () => {
	test("the message is the sentence the caller wrote", () => {
		const error = invalidInput("ticket", "Reopen the ticket before you assign an agent.");
		expect(error.code).toBe("INPUT_VALIDATION_FAILED");
		expect(error.status).toBe(errors.INPUT_VALIDATION_FAILED.status);
		expect(error.defined).toBe(true);
		expect(error.message).toBe("Reopen the ticket before you assign an agent.");
		expect(error.message).not.toBe(errors.INPUT_VALIDATION_FAILED.message);
	});

	test("the issue keeps the sentence and the path", () => {
		const error = invalidInput("ticket", "Reopen the ticket before you assign an agent.");
		expect((error.data as { issues: unknown[] }).issues).toEqual([
			{ message: "Reopen the ticket before you assign an agent.", path: ["ticket"] },
		]);
	});
});

describe("invalidIssues", () => {
	test("the message names the field of each issue", () => {
		const error = invalidIssues([
			{ message: "Expected a title.", path: ["title"] },
			{ message: "Expected a number.", path: ["nodes", 2, "minutes"] },
		]);
		expect(error.code).toBe("INPUT_VALIDATION_FAILED");
		expect(error.status).toBe(errors.INPUT_VALIDATION_FAILED.status);
		expect(error.defined).toBe(true);
		expect(error.message).toBe("title: Expected a title. nodes.2.minutes: Expected a number.");
	});

	test("an issue without a path contributes its sentence alone", () => {
		expect(invalidIssues([{ message: "Send one of the two fields." }]).message).toBe("Send one of the two fields.");
	});

	test("the issues reach the client unchanged", () => {
		const issues = [{ message: "Expected a title.", path: ["title"] }];
		expect((invalidIssues(issues).data as { issues: unknown[] }).issues).toEqual(issues);
	});
});
