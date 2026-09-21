import type { Query, QueryClient, QueryKey } from "@tanstack/react-query";
import type { TicketSummary, TrellisClient } from "@trellis/api";

type ListOutput = { items: TicketSummary[] };
type InfiniteListOutput = { pages: ListOutput[] };

export type RefreshBehindSheetOptions = {
	queryClient: QueryClient;
	client: TrellisClient;
};

const refreshFamilies = [
	["tickets", "list"],
	["tickets", "counts"],
	["pullRequests", "list"],
	["agentRuns", "list"],
	["reviews", "status"],
	["reviews", "metadata"],
];

const pathOf = (queryKey: QueryKey): readonly string[] => {
	const path = queryKey[0];
	return Array.isArray(path) ? path.map(String) : [];
};

const pathStartsWith = (path: readonly string[], prefix: readonly string[]) =>
	prefix.every((part, index) => path[index] === part);

const isInfinite = (query: Query) => (query.queryKey[1] as { type?: string } | undefined)?.type === "infinite";

const ticketRows = (query: Query): TicketSummary[] => {
	if (!pathStartsWith(pathOf(query.queryKey), ["tickets", "list"])) return [];
	const data = query.state.data;
	if (data === undefined) return [];
	if (isInfinite(query)) return (data as InfiniteListOutput).pages.flatMap((page) => page.items);
	return (data as ListOutput).items;
};

const stalePullRequestIds = (queryClient: QueryClient): string[] => {
	const ids = new Set<string>();
	for (const query of queryClient.getQueryCache().getAll()) {
		if (query.getObserversCount() === 0) continue;
		for (const ticket of ticketRows(query)) {
			for (const pr of ticket.prRows) {
				if (pr.state === "open" || pr.isQueued) ids.add(pr.id);
			}
		}
	}
	return [...ids];
};

const refreshListQueries = (queryClient: QueryClient) =>
	queryClient.invalidateQueries({
		predicate: (query) => refreshFamilies.some((family) => pathStartsWith(pathOf(query.queryKey), family)),
	});

const refreshPullRequests = async (options: RefreshBehindSheetOptions, ids: readonly string[]) => {
	const pending = [...ids];
	const workers = Array.from({ length: Math.min(4, pending.length) }, async () => {
		for (;;) {
			const id = pending.shift();
			if (id === undefined) return;
			await options.client.pullRequests.refresh({ id });
			await refreshListQueries(options.queryClient);
		}
	});
	await Promise.all(workers);
};

export const refreshBehindSheet = (options: RefreshBehindSheetOptions) => {
	const ids = stalePullRequestIds(options.queryClient);
	void refreshListQueries(options.queryClient);
	void refreshPullRequests(options, ids).then(
		() => undefined,
		() => undefined,
	);
};
