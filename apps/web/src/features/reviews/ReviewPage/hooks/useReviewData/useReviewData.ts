import { useMutation, useQuery } from "@tanstack/react-query";
import type { ReviewRevision, ReviewThread } from "@trellis/api";
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
	return { revision, setRevision, status, threads, refresh, refreshAll };
};
