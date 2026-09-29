import type { Ticket, TimelineItem, TimelineListInput, TimelineListOutput } from "@trellis/api";
import type { TrellisClient } from "@trellis/api/client";
import { compact } from "./context.ts";

const pageMax = 100;

export const activityPages = async function* (
	ticket: string,
	want: number,
	read: (input: TimelineListInput) => Promise<TimelineListOutput>,
): AsyncGenerator<TimelineItem[]> {
	let before: string | undefined;
	let taken = 0;
	while (taken < want) {
		const page = await read(compact({ ticket, before, limit: Math.min(want - taken, pageMax) }));
		taken += page.items.length;
		yield page.items;
		if (page.nextCursor === null) return;
		before = page.nextCursor;
	}
};

export const readTicketWithActivity = async (
	client: TrellisClient,
	ticketRef: string,
): Promise<{ ticket: Ticket; timeline: TimelineListOutput }> => {
	const ticket = await client.tickets.get({ ticket: ticketRef });
	const items: TimelineItem[] = [];
	for await (const page of activityPages(ticketRef, Number.POSITIVE_INFINITY, (input) => client.timeline.list(input))) {
		items.push(...page);
	}
	return { ticket, timeline: { items, nextCursor: null } };
};
