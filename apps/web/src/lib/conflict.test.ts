import { expect, test } from "bun:test";
import { ORPCError } from "@orpc/client";
import type { Ticket } from "@trellis/api";
import { conflictCurrent, isConflict } from "./conflict.ts";

test("narrows only the ticket version conflict", () => {
	const ticket = { version: 7 } as Ticket;
	const ticketConflict = new ORPCError("VERSION_CONFLICT", {
		message: "The ticket changed since the version you sent.",
		data: { current: ticket },
	});
	const pageConflict = new ORPCError("PAGE_VERSION_CONFLICT", {
		message: "The page changed since the revision you sent.",
		data: { current: { revision: 4 } },
	});

	expect(isConflict(ticketConflict)).toBe(true);
	expect(conflictCurrent(ticketConflict)).toBe(ticket);
	expect(isConflict(pageConflict)).toBe(false);
	expect(conflictCurrent(pageConflict)).toBeNull();
});
