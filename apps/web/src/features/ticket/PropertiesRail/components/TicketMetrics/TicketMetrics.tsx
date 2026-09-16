import { useQuery } from "@tanstack/react-query";
import type { Ticket } from "@trellis/api";
import { useApp } from "../../../../../lib/appContext";
import { formatCount, formatDuration, tabularClass } from "../../../../../lib/format";
import { ticketMetrics } from "../../utils/ticketMetrics";
import { Row } from "../Row";

const unavailable = "Unavailable";

export function TicketMetrics({ ticket }: { ticket: Ticket }) {
	const { orpc } = useApp();
	const query = useQuery({
		...orpc.agentRuns.list.queryOptions({ input: { ticket: ticket.identifier }, retry: false }),
	});
	const metrics = ticketMetrics(query.data ?? []);
	const pending = query.isPending;
	const failed = query.isError;
	const tokens = pending
		? "Load…"
		: failed || metrics.tokenCount === null
			? unavailable
			: formatCount(metrics.tokenCount);
	const duration = pending
		? "Load…"
		: failed || metrics.durationMs === null
			? unavailable
			: formatDuration(metrics.durationMs);
	const age = formatDuration(Date.now() - Date.parse(ticket.createdAt));
	return (
		<>
			<Row label="Tokens burned">
				<span className={tabularClass}>{tokens}</span>
			</Row>
			<Row label="Time burned">
				<span className={tabularClass}>{duration}</span>
			</Row>
			<Row label="Age">
				<span className={tabularClass}>{age}</span>
			</Row>
		</>
	);
}
