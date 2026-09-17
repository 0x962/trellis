import { describe, expect, test } from "bun:test";
import { ORPCError } from "@orpc/client";
import type { Ticket } from "@trellis/api";
import { ticket } from "../../test/fixtures";
import { conflictCurrent, conflictMessage, errorMessage, isConflict } from "./conflict";

const current = ticket({ version: 7 }) as unknown as Ticket;

const conflict = () =>
	new ORPCError("VERSION_CONFLICT", {
		defined: true,
		status: 412,
		message: "The ticket changed since the version you sent.",
		data: { current },
	});

describe("lib/conflict", () => {
	// CF-01
	test("isConflict accepts the 412 and refuses every other failure", () => {
		expect(isConflict(conflict())).toBe(true);
		expect(isConflict(new ORPCError("PROJECT_ARCHIVED", { status: 409 }))).toBe(false);
		expect(isConflict(new Error("offline"))).toBe(false);
	});

	// CF-02
	test("conflictCurrent returns the row the server holds", () => {
		expect(conflictCurrent(conflict())).toBe(current);
		expect(conflictCurrent(new Error("offline"))).toBe(null);
	});

	// CF-03
	test("conflictMessage names one ticket by its identifier", () => {
		expect(conflictMessage("CDE-42")).toBe("CDE-42 changed first. The row shows the other version.");
	});

	// CF-04
	test("conflictMessage counts the rows of a batch", () => {
		expect(conflictMessage(3)).toBe("3 tickets changed first. The rows show the other version.");
	});

	// CF-05
	test("errorMessage reads the message of an error and stringifies the rest", () => {
		expect(errorMessage(new Error("offline"))).toBe("offline");
		expect(errorMessage("offline")).toBe("offline");
	});
});
