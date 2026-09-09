import { describe, expect, test } from "bun:test";
import { ticketSummary } from "../../test/fixtures.ts";
import { ListQuerySchema, TicketSummarySchema } from "./ticket.ts";

describe("ListQuerySchema", () => {
	// The same string reaches the server from the web URL, the CLI flags, and
	// curl. URLSearchParams hands every value over as one string.
	test("ListQuery parses the plan's example query string", () => {
		const params = new URLSearchParams(
			"project=CDE&status=in-progress,agent-review&parent=none&ci=fail&sort=-updatedAt",
		);
		expect(ListQuerySchema.parse(Object.fromEntries(params))).toEqual({
			project: "CDE",
			status: ["in-progress", "agent-review"],
			parent: "none",
			ci: ["fail"],
			sort: "-updatedAt",
			limit: 50,
			subprojects: true,
		});
	});

	test("ListQuery accepts a comma list as a string or as an array", () => {
		const lists: Record<string, string[]> = {
			status: ["in-progress", "agent-review"],
			category: ["todo", "done"],
			priority: ["high", "low"],
			ci: ["fail", "pending"],
		};
		for (const [field, values] of Object.entries(lists)) {
			const fromArray = ListQuerySchema.parse({ [field]: values });
			const fromString = ListQuerySchema.parse({ [field]: values.join(",") });
			expect(fromArray, field).toEqual(fromString);
			expect(fromArray[field as keyof typeof fromArray], field).toEqual(values);
			expect(ListQuerySchema.parse({ [field]: "" })[field as keyof typeof fromArray], field).toEqual([]);
		}
	});

	test("ListQuery rejects an unknown sort field, a limit outside 1..200, and unknown enum values", () => {
		for (const input of [
			{ sort: "title" },
			{ limit: 201 },
			{ limit: 0 },
			{ category: "bogus" },
			{ pr: "maybe" },
			{ reviewer: "system" },
			{ updated: "yesterday" },
		]) {
			expect(ListQuerySchema.safeParse(input).success, JSON.stringify(input)).toBe(false);
		}
		expect(ListQuerySchema.parse({ limit: 200 }).limit).toBe(200);
		expect(ListQuerySchema.parse({ limit: 1 }).limit).toBe(1);
		for (const field of ["updatedAt", "createdAt", "priority", "number", "status", "position"]) {
			for (const sort of [field, `-${field}`]) {
				expect(ListQuerySchema.parse({ sort }).sort, sort).toBe(sort);
			}
		}
	});
});

describe("TicketSummarySchema", () => {
	test("TicketSummary accepts the plan's shape and rejects a bad date and a bad priority", () => {
		const summary = ticketSummary();
		expect(TicketSummarySchema.parse(summary)).toEqual(summary);
		expect(TicketSummarySchema.safeParse({ ...summary, createdAt: "not a date" }).success).toBe(false);
		expect(TicketSummarySchema.safeParse({ ...summary, priority: "critical" }).success).toBe(false);
	});
});
