import { expect, test } from "bun:test";
import type { PageSummary, TicketSummary } from "@trellis/api";
import { searchRows } from "./searchRows";

test("keeps ticket results before Page results", () => {
	const ticket = { id: "ticket" } as TicketSummary;
	const page = { id: "page" } as PageSummary;

	expect(searchRows([ticket], [page])).toEqual([
		{ kind: "ticket", ticket },
		{ kind: "page", page },
	]);
});
