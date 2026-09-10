import { useMutation } from "@tanstack/react-query";
import type { LinkedPullRequest, TicketSummary } from "@trellis/api";
import { Button, cx } from "@trellis/ui";
import { RefreshCw } from "lucide-react";
import { useApp } from "../../../../../lib/appContext";
import { relativeTime, tabularClass } from "../../../../../lib/format";
import { ghErrorLine } from "../../../utils/ghErrorLine";

export type RefreshControlProps = {
	ticket: TicketSummary;
	prs: readonly LinkedPullRequest[];
};

// The most recent poll across the listed pull requests. A pull request the
// poller never reached carries no fetch time.
const newestFetch = (prs: readonly LinkedPullRequest[]): string | null => {
	const times = prs.map((pr) => pr.fetchedAt).filter((at): at is string => at !== null);
	if (times.length === 0) return null;
	return times.sort()[times.length - 1]!;
};

// The age of the newest fetch and the control that polls every listed pull
// request again.
export function RefreshControl({ ticket, prs }: RefreshControlProps) {
	const { client, orpc, queryClient } = useApp();
	const listKey = orpc.pullRequests.list.queryKey({ input: { ticket: ticket.id } });
	const refresh = useMutation({
		mutationFn: async () => await Promise.all(prs.map((pr) => client.pullRequests.refresh({ id: pr.id }))),
		onSuccess: (rows) => {
			queryClient.setQueryData(listKey, (listed) =>
				listed!.map((pr) => {
					const fresh = rows.find((row) => row.id === pr.id);
					return fresh === undefined ? pr : { ...pr, ...fresh };
				}),
			);
		},
	});

	const fetchedAt = newestFetch(prs);
	if (fetchedAt === null) return null;
	return (
		<span className="flex items-center gap-2">
			<span className={cx("text-sm text-fg-faint", tabularClass)}>Fetched {relativeTime(fetchedAt)}</span>
			<Button
				size="sm"
				variant="quiet"
				icon={<RefreshCw />}
				disabled={refresh.isPending}
				onClick={() => refresh.mutate()}
			>
				Refresh
			</Button>
			{refresh.error !== null && (
				<span data-refresh-error="" role="alert" className="text-sm text-danger">
					{ghErrorLine(refresh.error)}
				</span>
			)}
		</span>
	);
}
