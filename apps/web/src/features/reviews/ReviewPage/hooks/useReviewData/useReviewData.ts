import { useMutation, useQuery } from "@tanstack/react-query";
import { type ReviewRevision, type ReviewThread, reviewRef } from "@trellis/api";
import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "../../../../../lib/appContext";

export const useReviewData = (pr: string) => {
	const { client, orpc, queryClient } = useApp();
	const latest = useQuery(orpc.reviews.revision.queryOptions({ input: { pr } }));
	const [shownRevision, setShownRevision] = useState<{ pr: string; revision: ReviewRevision } | null>(null);
	const revision = shownRevision?.pr === pr ? shownRevision.revision : null;
	const setRevision = useCallback(
		(next: ReviewRevision | null) => setShownRevision(next === null ? null : { pr, revision: next }),
		[pr],
	);
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
	// The verdict bar delivers to this agent assignment. A restart replaces
	// the run, so this read follows the 45 second beat of the GitHub status.
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
	const bootedPr = useRef("");
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
		if (!latest.isSuccess) return;
		if (latest.data) setRevision(latest.data);
		if (bootedPr.current === pr) return;
		bootedPr.current = pr;
		refresh.mutate();
	}, [pr, latest.isSuccess, latest.data, refresh.mutate, setRevision]);
	const refreshAll = () => {
		refresh.mutate();
		void status.refetch();
	};
	useEffect(() => {
		const onFocus = () => {
			refresh.mutate();
			void status.refetch();
		};
		window.addEventListener("focus", onFocus);
		return () => window.removeEventListener("focus", onFocus);
	}, [refresh.mutate, status.refetch]);
	const requestedRevision = useRef("");
	useEffect(() => {
		if (revision === null || status.data === undefined) return;
		const current = `${pr}:${status.data.headRefOid}:${status.data.baseRefOid}`;
		if (status.data.headRefOid === revision.headSha && status.data.baseRefOid === revision.baseSha) {
			requestedRevision.current = "";
			return;
		}
		if (requestedRevision.current === current || refresh.isPending) return;
		requestedRevision.current = current;
		refresh.mutate();
	}, [pr, revision, status.data, refresh.isPending, refresh.mutate]);
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
