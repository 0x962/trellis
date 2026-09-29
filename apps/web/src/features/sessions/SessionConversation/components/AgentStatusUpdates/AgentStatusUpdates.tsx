import { useQuery } from "@tanstack/react-query";
import type { AgentRun } from "@trellis/api";
import { Button, EmptyState, FailureState, SessionStatusPaneShell } from "@trellis/ui";
import { useEffect, useState } from "react";
import { useApp } from "../../../../../lib/appContext";
import { useOpenLink } from "../../../../../lib/openLink";
import { AgentStatusUpdatesPane } from "./AgentStatusUpdatesPane";
import { agentStatusUpdatesQueryOptions } from "./agentStatusUpdatesState";

export function AgentStatusUpdates({ run, visible }: { run: AgentRun; visible: boolean }) {
	const { orpc, scheduler } = useApp();
	const openLink = useOpenLink();
	const [now, setNow] = useState(() => scheduler.now());
	const query = useQuery(agentStatusUpdatesQueryOptions(orpc, run));

	useEffect(() => {
		if (!visible) return;
		let timer: unknown;
		const tick = () => {
			setNow(scheduler.now());
			timer = scheduler.setTimeout(tick, 60_000 - (scheduler.now() % 60_000));
		};
		tick();
		return () => scheduler.clearTimeout(timer);
	}, [scheduler, visible]);

	if (!visible) return null;
	if (query.data !== undefined)
		return (
			<AgentStatusUpdatesPane run={run} updates={query.data} now={new Date(now).toISOString()} onOpenLink={openLink} />
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
