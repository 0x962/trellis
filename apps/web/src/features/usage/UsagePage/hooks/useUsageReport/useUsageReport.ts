import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import type { UsageDays } from "@trellis/api";
import { useApp } from "../../../../../lib/appContext";

// The range the page opens on when the URL names none.
const DEFAULT_DAYS: UsageDays = 30;

// The report of the Agent Usage tab, and the range it covers. Two
// components read it: the controls in the Topbar set the range and start a
// new scan, and the tab below draws the answer. One place holds the
// default range, so the two can never ask for different ranges.
export function useUsageReport() {
	const { orpc, client, queryClient } = useApp();
	const search = useSearch({ from: "/usage" });
	const navigate = useNavigate({ from: "/usage" });
	const days: UsageDays = search.days ?? DEFAULT_DAYS;
	const report = useQuery({
		...orpc.usage.report.queryOptions({ input: { days } }),
		staleTime: 5 * 60_000,
		placeholderData: keepPreviousData,
	});
	// A new scan reads every agent transcript on this machine again, so the
	// server takes the work and the query then re-reads the answer.
	const refresh = useMutation({
		mutationFn: () => client.usage.report({ days, refresh: true }),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: orpc.usage.report.key() }),
	});
	// A change of range drops the selected row and the selected day,
	// because neither one survives a different set of days.
	const setDays = (next: UsageDays) =>
		void navigate({
			search: (previous) => ({ ...previous, days: next, row: undefined, day: undefined }),
			replace: true,
		});
	return { days, setDays, report, refresh };
}
