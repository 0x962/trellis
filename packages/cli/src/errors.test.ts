import { expect, test } from "bun:test";
import { ORPCError } from "@orpc/client";
import { formatError } from "./errors.ts";

test("keeps a malformed not-found payload out of the CLI line", () => {
	const error = new ORPCError("NOT_FOUND", {
		message: "No row matches the ref.",
		data: {},
	});

	expect(formatError(error)).toBe("error: No row matches the ref. (NOT_FOUND)");
});
