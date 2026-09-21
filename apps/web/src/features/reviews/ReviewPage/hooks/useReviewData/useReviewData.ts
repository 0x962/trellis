import { useMutation, useQuery } from "@tanstack/react-query";
import { type ReviewRevision, type ReviewThread, reviewRef } from "@trellis/api";
import { useEffect, useRef, useState } from "react";
import { useApp } from "../../../../../lib/appContext";

export const useReviewData = (pr: string) => {
	const { client, orpc, queryClient } = useApp();
	const latest = useQuery(orpc.reviews.revision.queryOptions({ input: { pr } }));
	const [revision, setRevision] = useState<ReviewRevision | null>(null);
	const status = useQuery({
		...orpc.reviews.status.queryOptions({ input: { pr } }),
		enabled: revision !== null,
		refetchInterval: 45000,
	});
	// `reviews.status` names the ticket that links this pull request. The
	// ticket carries the review focus sentences, the tickets it waits on, and
	// the pull request id that the summary and the evidence are stored under.
	const identifier = status.data?.ticket?.identifier ?? "";
	const ticket = useQuery({
		...orpc.tickets.get.queryOptions({ input: { ticket: identifier } }),
		enabled: identifier !== "",
	});
	// The agent assignment of the ticket. `Send back` names it, and the name
	// changes when a restart replaces the run, so this read follows the same
	// 45 second beat as the GitHub status.
	const runs = useQuery({
		...orpc.agentRuns.list.queryOptions({ input: { ticket: identifier, assigned: true } }),
		enabled: identifier !== "",
		refetchInterval: 45000,
	});
	const run = runs.data?.find((row) => row.kind === "agent") ?? null;
	const ref = reviewRef(pr);
	const linkedPr =
		ticket.data?.prs.find((row) => row.owner === ref.owner && row.repo === ref.repo && row.number === ref.number) ??
		null;
	const summary = useQuery({
		...orpc.pullRequests.readSummary.queryOptions({ input: { id: linkedPr?.id ?? "" } }),
		enabled: linkedPr !== null,
	});
	const evidence = useQuery({
		...orpc.pullRequests.listEvidence.queryOptions({ input: { id: linkedPr?.id ?? "" } }),
		enabled: linkedPr !== null,
	});
	// The conditions, the summary, the review focus and the evidence all come
	// from this chain of four requests. Until the last one answers, the page
	// draws none of the four: a block that draws early would say that the
	// agent wrote no summary before anybody asked for it.
	const factsReady =
		status.isFetched &&
		(status.data?.ticket == null || ticket.isFetched) &&
		(linkedPr === null || (summary.isFetched && evidence.isFetched));
	const booted = useRef(false);
	const threads = useQuery({
		...orpc.reviews.list.queryOptions({ input: { pr, all: true } }),
		queryFn: async () => {
			const items: ReviewThread[] = [];
			let total = 0;
			let open = 0;
			for (let offset = 0; ; offset += 500) {
				const page = await client.reviews.list({ pr, all: true, offset, limit: 500 });
				items.push(...page.items);
				total = page.total;
				open = page.open;
				if (page.items.length < 500) break;
			}
			return { items, total, open };
		},
	});
	const refresh = useMutation({
		mutationFn: () => client.reviews.refresh({ pr }),
		onSuccess: (data) => {
			setRevision(data);
			void queryClient.invalidateQueries({ queryKey: orpc.reviews.metadata.key() });
			queryClient.setQueryData(orpc.reviews.revision.queryKey({ input: { pr } }), data);
		},
	});
	useEffect(() => {
		if (booted.current || !latest.isSuccess) return;
		booted.current = true;
		if (latest.data) setRevision(latest.data);
		else refresh.mutate();
	}, [latest.isSuccess, latest.data, refresh.mutate]);
	const refreshAll = () => {
		refresh.mutate();
		void status.refetch();
	};
	return {
		revision,
		setRevision,
		status,
		ticket,
		run,
		linkedPr,
		summary,
		evidence,
		factsReady,
		threads,
		refresh,
		refreshAll,
	};
};
