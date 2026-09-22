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
		refetchOnWindowFocus: "always",
	});
	// `reviews.status` names the ticket that links this pull request. The
	// ticket carries the pull request id that the summary and the evidence
	// document are stored under.
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
		...orpc.pullRequests.readEvidence.queryOptions({ input: { id: linkedPr?.id ?? "" } }),
		enabled: linkedPr !== null,
	});
	// The summary and the evidence document come from this chain of three
	// requests. Until the last one answers, the Overview tab draws neither: a
	// block that draws early would say that the agent wrote no summary before
	// anybody asked for it.
	const overviewReady =
		status.isFetched &&
		(status.data?.ticket == null || ticket.isFetched) &&
		(linkedPr === null || (summary.isFetched && evidence.isFetched));
	// A delivery changes state after the submit answers, and the server sends
	// no event for it, so the read repeats while a delivery is on its way.
	const submissions = useQuery({
		...orpc.reviews.submissions.queryOptions({ input: { pr } }),
		refetchInterval: (query) =>
			query.state.data?.some((submission) =>
				submission.deliveries.some((delivery) => delivery.state === "pending" || delivery.state === "sending"),
			)
				? 3000
				: false,
	});
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
		overviewReady,
		threads,
		submissions,
		refresh,
		refreshAll,
	};
};
