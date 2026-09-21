import { expect, test } from "bun:test";
import type { TicketSummary } from "@trellis/api";
import { renderToStaticMarkup } from "react-dom/server";
import { TitleCell } from "./TitleCell";

const ticket = (fields: Partial<TicketSummary> = {}) =>
	({
		identifier: "OP-43",
		title: "Private hotel-assignment API",
		parent: null,
		childCount: 0,
		childDoneCount: 0,
		attachmentCount: 0,
		commentCount: 0,
		...fields,
	}) as TicketSummary;

test("links the comment count to the ticket comments section", () => {
	const html = renderToStaticMarkup(<TitleCell ticket={ticket({ commentCount: 3 })} disclosure={null} />);

	expect(html).toContain('href="/t/OP-43#comments"');
	expect(html).toContain('aria-label="3 comments"');
});
