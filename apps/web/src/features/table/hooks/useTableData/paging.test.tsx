import { describe, expect, test } from "bun:test";
import type { ListOutput, TicketSummary } from "@trellis/api";
import { renderToStaticMarkup } from "react-dom/server";
import { TitleCell } from "../../Row/components/TitleCell";
import { pageRows, shouldLoadNextPage } from "./paging";

const ticket = (number: number): TicketSummary =>
	({
		id: `ticket-${number}`,
		identifier: `TRL-${number}`,
		title: `Ticket ${number}`,
		status: { category: "started" },
		parent: null,
		childCount: 0,
		childDoneCount: 0,
		attachmentCount: 0,
	}) as TicketSummary;

const page = (start: number, count: number, nextCursor: string | null): ListOutput => ({
	items: Array.from({ length: count }, (_value, index) => ticket(start + index)),
	nextCursor,
});

describe("ticket table paging", () => {
	test("keeps row 2001 reachable and renders it", () => {
		const pages = Array.from({ length: 10 }, (_value, index) => page(index * 200 + 1, 200, `page-${index + 2}`));
		pages.push(page(2001, 1, null));

		const rows = pageRows(pages)!;
		const html = renderToStaticMarkup(<TitleCell ticket={rows[2000]!} />);

		expect(rows).toHaveLength(2001);
		expect(html).toContain("Ticket 2001");
	});

	test("accepts an empty final page", () => {
		const rows = pageRows([page(1, 200, "page-2"), page(201, 0, null)]);

		expect(rows).toHaveLength(200);
		expect(shouldLoadNextPage(true, false, false)).toBeFalse();
	});

	test("does not duplicate rows after a query change", () => {
		const firstQuery = pageRows([page(1, 2, null)])!;
		const secondQuery = pageRows([page(2, 2, null)])!;

		expect(firstQuery.map((row) => row.identifier)).toEqual(["TRL-1", "TRL-2"]);
		expect(secondQuery.map((row) => row.identifier)).toEqual(["TRL-2", "TRL-3"]);
	});

	test("requests each available page without a row-count stop", () => {
		expect(shouldLoadNextPage(true, true, false)).toBeTrue();
		expect(shouldLoadNextPage(true, true, true)).toBeFalse();
		expect(shouldLoadNextPage(false, true, false)).toBeFalse();
	});
});
