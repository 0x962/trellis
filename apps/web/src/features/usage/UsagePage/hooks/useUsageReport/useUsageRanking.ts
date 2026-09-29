import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { UsageGroupBy, UsageMetric, UsageReport } from "@trellis/api";
import { useEffect, useState } from "react";
import { useApp } from "../../../../../lib/appContext";

export function useUsageRanking(
	report: UsageReport | undefined,
	group: UsageGroupBy,
	metric: UsageMetric,
	row: string | null,
	day: string | null,
	clearRow: () => void,
) {
	const { orpc } = useApp();
	const key = JSON.stringify([report?.computedAt, report?.days, group, metric]);
	const sessionKey = JSON.stringify([key, row, day]);
	const [groups, setGroups] = useState({ key, page: 0 });
	const [sessions, setSessions] = useState({ key: sessionKey, page: 0 });
	if (groups.key !== key) setGroups({ key, page: 0 });
	if (sessions.key !== sessionKey) setSessions({ key: sessionKey, page: 0 });
	const groupPage = groups.key === key ? groups.page : 0;
	const sessionPage = sessions.key === sessionKey ? sessions.page : 0;
	const query = useQuery({
		...orpc.usage.ranking.queryOptions({
			input: {
				days: report?.days ?? 30,
				computedAt: report?.computedAt ?? "1970-01-01T00:00:00.000Z",
				group,
				metric,
				groupPage,
				sessionPage,
				row: row ?? undefined,
				day: day ?? undefined,
			},
		}),
		enabled: report !== undefined,
		staleTime: Infinity,
		retry: false,
		meta: { usageScope: sessionKey },
		placeholderData: (previous, query) =>
			query?.meta?.usageScope === sessionKey ? keepPreviousData(previous) : undefined,
	});
	useEffect(() => {
		if (row !== null && query.isSuccess && !query.isPlaceholderData && query.data.selected === null) clearRow();
	}, [row, query.isSuccess, query.isPlaceholderData, query.data?.selected, clearRow]);
	return {
		...query,
		changeGroupPage: (direction: -1 | 1) => setGroups({ key, page: Math.max(0, groupPage + direction) }),
		changeSessionPage: (direction: -1 | 1) =>
			setSessions({ key: sessionKey, page: Math.max(0, sessionPage + direction) }),
	};
}
