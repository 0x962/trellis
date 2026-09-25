import { expect, test } from "bun:test";
import { ORPCError } from "@orpc/client";
import { exitCodeFor, formatError } from "./errors.ts";

test("keeps a malformed not-found payload out of the CLI line", () => {
	const error = new ORPCError("NOT_FOUND", {
		message: "No row matches the ref.",
		data: {},
	});

	expect(formatError(error)).toBe("error: No row matches the ref. (NOT_FOUND)");
});

test("formats the ticket conflict from its ticket version payload", () => {
	const error = new ORPCError("VERSION_CONFLICT", {
		message: "The ticket changed since the version you sent.",
		data: { current: { version: 7 } },
	});

	expect(formatError(error)).toBe(
		"error: The ticket changed since the version you sent. The current version is 7. (VERSION_CONFLICT)",
	);
});

test("keeps the Page conflict separate from the ticket formatter", () => {
	const error = new ORPCError("PAGE_VERSION_CONFLICT", {
		message: "The page changed since the revision you sent.",
		data: { current: { revision: 4 } },
	});

	expect(exitCodeFor(error.code)).toBe(4);
	expect(formatError(error)).toBe(
		"error: The page changed since the revision you sent. The current revision is 4. (PAGE_VERSION_CONFLICT)",
	);
});
