import type { LinkedPullRequest, Ticket, TicketAnswer, TimelineListOutput } from "@trellis/api";
import { shortZonedDateTime } from "@trellis/api/time";
import { defineCommand } from "citty";
import { clientOf } from "../client.ts";
import { contextOf } from "../context.ts";
import { heading, json, type ListSpec, renderRecord, renderTable, ticketRecord } from "../output.ts";
import { renderActivity } from "../timeline.ts";

export const prList: ListSpec<LinkedPullRequest> = {
	columns: [
		{ name: "id", value: (row) => row.id },
		{ name: "number", value: (row) => String(row.number) },
		{ name: "state", value: (row) => row.state },
		{ name: "ciState", value: (row) => row.ciState },
		{ name: "url", value: (row) => row.url },
	],
	identifier: (row) => row.id,
};

// The newest answer of a question ticket: the option, who picked it and
// when, then the reason.
const renderAnswer = (answer: TicketAnswer, color: boolean) =>
	`\n${heading("answer", color)}option ${answer.option}  ${answer.actor.kind}:${answer.actor.displayName ?? answer.actor.name}  ${shortZonedDateTime(answer.createdAt)}\n${answer.reason}\n`;

const renderTicket = (ticket: Ticket, color: boolean, prs: boolean): string => {
	const block = renderRecord(ticket, ticketRecord.fields);
	const description = ticket.description === "" ? "" : `\n${ticket.description}\n`;
	const answer = ticket.answer === null ? "" : renderAnswer(ticket.answer, color);
	const linked = prs ? `\n${heading("prs", color)}${renderTable(ticket.prs, prList.columns)}` : "";
	return `${block}${description}${answer}${linked}`;
};

export default defineCommand({
	meta: { name: "show", description: "Show one ticket" },
	args: {
		ticket: { type: "positional", required: true, description: "Ticket ref" },
		activity: { type: "boolean", description: "Print the activity" },
		prs: { type: "boolean", description: "Print the linked pull requests" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const { args } = context;
		const client = clientOf(ctx);
		const ticket = await client.tickets.get({ ticket: args.ticket });
		const wantsTimeline = args.activity === true;
		const timeline: TimelineListOutput | undefined = wantsTimeline
			? await client.timeline.list({ ticket: args.ticket })
			: undefined;
		const { mode, color } = ctx.format;
		if (mode === "quiet") {
			ctx.out.write(`${ticket.identifier}\n`);
			return;
		}
		if (mode === "json" || mode === "jsonl") {
			ctx.out.write(json(timeline === undefined ? ticket : { ticket, timeline }));
			return;
		}
		ctx.out.write(renderTicket(ticket, color, args.prs === true));
		if (timeline === undefined) return;
		ctx.out.write(`\n${heading("activity", color)}${renderActivity(timeline.items)}`);
	},
});
