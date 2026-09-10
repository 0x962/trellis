import { useQuery } from "@tanstack/react-query";
import type { CountsQueryInput } from "@trellis/api";
import { EmptyState } from "../../../../components/EmptyState";
import { formatCount } from "../../../../lib/format";
import { getOrpc } from "../../../../lib/orpc";

// The tickets agents hold now: every ticket in a started status.
export const startedInput: CountsQueryInput = { category: ["started"] };

// Nothing waits on a person. The one line names what the agents hold. The
// line renders once the count is known, so the sentence never changes.
export function EmptyInbox() {
	const started = useQuery(getOrpc().tickets.counts.queryOptions({ input: startedInput }));
	if (started.data === undefined) return null;
	const { total } = started.data;
	const noun = total === 1 ? "ticket" : "tickets";
	return <EmptyState title={`Nothing needs you. ${formatCount(total)} ${noun} in progress by agents.`} />;
}
