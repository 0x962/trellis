import { describe, expect, test } from "bun:test";
import { statusId, ticketSummary } from "../../test/fixtures.ts";
import { accepts } from "../../test/standardSchema.ts";
import { tickets } from "./tickets.ts";

const input = (name: keyof typeof tickets) => tickets[name]["~orpc"].inputSchema;
const output = (name: keyof typeof tickets) => tickets[name]["~orpc"].outputSchema;

describe("tickets contract", () => {
	test("ticket procedures use the shared ListQuery, cap batch refs at 200, and require project and title on create", async () => {
		const query = Object.fromEntries(
			new URLSearchParams("project=CDE&status=in-progress,agent-review&parent=none&ci=fail&sort=-updatedAt"),
		);
		expect(await accepts(input("list"), query)).toBe(true);

		const refs = (count: number) => Array.from({ length: count }, (_, index) => `CDE-${index + 1}`);
		expect(await accepts(input("updateMany"), { tickets: refs(200), priority: "high" })).toBe(true);
		expect(await accepts(input("updateMany"), { tickets: refs(201), priority: "high" })).toBe(false);

		expect(await accepts(input("create"), { project: "CDE", title: "First" })).toBe(true);
		expect(await accepts(input("create"), { title: "First" })).toBe(false);
	});

	// A list carries no total: `tickets.counts` answers that with one query,
	// so a page never pays for a count(*). The output schema strips a `total`
	// the server might send, so a parsed page has no `total` key.
	test("list, board, counts, and delete outputs match the plan and list has no total", async () => {
		expect(await accepts(output("list"), { items: [ticketSummary()], nextCursor: null })).toBe(true);
		expect(await accepts(output("list"), { items: [], total: 0 })).toBe(false);
		const page = await output("list")!["~standard"].validate({ items: [], nextCursor: null, total: 0 });
		expect(page).toEqual({ value: { items: [], nextCursor: null } });
		expect(await accepts(output("board"), { columns: [{ statusId, count: 0, items: [] }] })).toBe(true);
		expect(await accepts(output("counts"), { total: 0, byStatus: [] })).toBe(true);
		expect(await accepts(output("delete"), { deleted: "CDE-42" })).toBe(true);
	});
});
