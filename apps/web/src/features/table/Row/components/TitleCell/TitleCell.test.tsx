import { expect, test } from "bun:test";
import type { TicketSummary } from "@trellis/api";
import { renderToStaticMarkup } from "react-dom/server";
import { TitleCell } from "./TitleCell";

const ticket = (fields: Partial<TicketSummary> = {}) =>
	({
		identifier: "OP-43",
		title: "Private hotel-assignment API",
		status: { category: "started" },
		parent: null,
		childCount: 0,
		childDoneCount: 0,
		attachmentCount: 0,
		commentCount: 0,
		...fields,
	}) as TicketSummary;

const done = (fields: Partial<TicketSummary> = {}) =>
	ticket({ status: { category: "done" } as TicketSummary["status"], ...fields });

test("links the comment count to the ticket comments section", () => {
	const html = renderToStaticMarkup(<TitleCell ticket={ticket({ commentCount: 3 })} />);

	expect(html).toContain('href="/t/OP-43#comments"');
	expect(html).toContain('aria-label="3 comments"');
});

test("a done ticket prints its title and no mark", () => {
	const html = renderToStaticMarkup(
		<TitleCell
			ticket={done({
				commentCount: 3,
				attachmentCount: 2,
				childCount: 4,
				childDoneCount: 4,
				parent: { identifier: "OP-40" } as TicketSummary["parent"],
			})}
		/>,
	);

	expect(html).toBe('<span class="truncate text-fg">Private hotel-assignment API</span>');
});

test("a canceled ticket prints its title and no mark", () => {
	const ticket = done({ status: { category: "canceled" } as TicketSummary["status"], commentCount: 3 });

	expect(renderToStaticMarkup(<TitleCell ticket={ticket} />)).not.toContain("comments");
});

test("a started ticket keeps its marks", () => {
	const html = renderToStaticMarkup(
		<TitleCell ticket={ticket({ attachmentCount: 2, parent: { identifier: "OP-40" } as TicketSummary["parent"] })} />,
	);

	expect(html).toContain('aria-label="Parent OP-40"');
	expect(html).toContain('aria-label="2 attachments"');
});
