import { useQuery } from "@tanstack/react-query";
import type { AgentRun } from "@trellis/api";
import { Button, EmptyState, FailureState } from "@trellis/ui";
import { useEffect, useState } from "react";
import { useApp } from "../../../../../lib/appContext";
import { useOpenLink } from "../../../../../lib/openLink";
import { SessionStatusContent } from "./SessionStatusContent";
import { sessionUpdateInput } from "./sessionStatusState";

const stateClass = [
	"order-none flex h-full min-h-0 w-93.5 shrink-0 flex-col border-s border-border bg-bg",
	"max-md:order-first max-md:h-auto max-md:max-h-130 max-md:w-full max-md:border-s-0 max-md:border-b",
].join(" ");

export function SessionStatus({ run, visible }: { run: AgentRun; visible: boolean }) {
	const { orpc, scheduler } = useApp();
	const openLink = useOpenLink();
	const [now, setNow] = useState(() => scheduler.now());
	const query = useQuery(orpc.sessionUpdates.get.queryOptions({ input: sessionUpdateInput(run) }));

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
			<SessionStatusContent run={run} updates={query.data} now={new Date(now).toISOString()} onOpenLink={openLink} />
		);

	return (
		<aside aria-label="Session status" className={stateClass}>
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
		</aside>
	);
}
