import { useInfiniteQuery } from "@tanstack/react-query";
import type { AgentRun, SessionUpdatesGetInput } from "@trellis/api";
import { Button, EmptyState, FailureState, SessionStatusPaneShell } from "@trellis/ui";
import { useEffect, useState } from "react";
import { useApp } from "../../../../../lib/appContext";
import { useOpenLink } from "../../../../../lib/openLink";
import { AgentStatusUpdatesPane } from "./AgentStatusUpdatesPane";

export function AgentStatusUpdates({ run, observerError }: { run: AgentRun; observerError: string | null }) {
	const { orpc, scheduler } = useApp();
	const openLink = useOpenLink();
	const [now, setNow] = useState(() => scheduler.now());
	type Cursor = NonNullable<SessionUpdatesGetInput["history"]>["before"];
	const query = useInfiniteQuery(
		orpc.sessionUpdates.get.infiniteOptions({
			input: (before: Cursor) => ({ sessionId: run.id, history: { before } }),
			initialPageParam: undefined as Cursor,
			getNextPageParam: (result) => result.nextCursor ?? undefined,
		}),
	);

	useEffect(() => {
		let timer: unknown;
		const tick = () => {
			setNow(scheduler.now());
			timer = scheduler.setTimeout(tick, 60_000 - (scheduler.now() % 60_000));
		};
		tick();
		return () => scheduler.clearTimeout(timer);
	}, [scheduler]);

	if (query.data !== undefined)
		return (
			<AgentStatusUpdatesPane
				key={run.id}
				run={run}
				updates={{
					...query.data.pages[0]!,
					history: [
						...new Map(query.data.pages.flatMap((page) => page.history!).map((update) => [update.id, update])).values(),
					],
				}}
				historyControl={{
					hasMore: query.hasNextPage,
					loading: query.isFetchingNextPage,
					error: query.isError,
					load: () => void query.fetchNextPage(),
					retry: () => void (query.isFetchNextPageError ? query.fetchNextPage() : query.refetch()),
				}}
				now={new Date(now).toISOString()}
				observerError={observerError}
				onOpenLink={openLink}
			/>
		);

	return (
		<SessionStatusPaneShell>
			<div className="flex min-h-0 flex-1 flex-col">
				{query.isError ? (
					<FailureState
						variant="section"
						title="The agent status did not load"
						action={
							<Button size="md" onClick={() => void query.refetch()}>
								Retry
							</Button>
						}
					/>
				) : (
					<div role="status" className="flex min-h-0 flex-1 flex-col">
						<EmptyState image={null} variant="section" title="Load agent status…" />
					</div>
				)}
			</div>
		</SessionStatusPaneShell>
	);
}
