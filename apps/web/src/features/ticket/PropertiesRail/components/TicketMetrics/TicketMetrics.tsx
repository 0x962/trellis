import { useQuery } from "@tanstack/react-query";
import type { Ticket } from "@trellis/api";
import { useApp } from "../../../../../lib/appContext";
import { formatCount, formatDuration, tabularClass } from "../../../../../lib/format";
import { Row } from "../Row";
import { type MetricRequestState, metricText } from "./metricPresentation";
import { useLiveAge } from "./useLiveAge";

export function TicketMetrics({ ticket }: { ticket: Ticket }) {
	const { orpc, scheduler } = useApp();
	const query = useQuery({
		...orpc.agentRuns.ticketMetrics.queryOptions({ input: { ticket: ticket.identifier }, retry: false }),
	});
	const state: MetricRequestState = query.isPending ? "pending" : query.isError ? "error" : "success";
	const ageMs = useLiveAge(state === "success" ? (query.data?.ageMs ?? null) : null, scheduler);
	const tokens = metricText(state, query.data?.tokenCount ?? null, formatCount);
	const duration = metricText(state, query.data?.durationMs ?? null, formatDuration);
	const age = metricText(state, ageMs, formatDuration);
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
