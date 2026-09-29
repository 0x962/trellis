import { EmptyState } from "../../primitives/EmptyState";
import { ScrollArea } from "../../primitives/ScrollArea";
import { FailureState } from "../FailureState";
import { HistoryControls } from "./components/HistoryControls";
import { StatusTimeline } from "./components/StatusTimeline";
import { SessionStatusPaneShell } from "./SessionStatusPaneShell";
import { sessionStatusNotice } from "./sessionStatusText";
import type { SessionStatusPaneProps, SessionUpdate } from "./types";

export function SessionStatusPane({
	updates,
	processState,
	now,
	observerError = null,
	renderMarkdown,
	onOpenLink,
	historyControl,
	className,
}: SessionStatusPaneProps) {
	const notice =
		observerError === null
			? sessionStatusNotice({ processState, request: updates.request, latestAt: updates.latest?.createdAt ?? null })
			: null;
	const history =
		updates.history ?? [updates.latest, updates.previous].filter((update): update is SessionUpdate => update !== null);
	return (
		<SessionStatusPaneShell className={className}>
			<ScrollArea label="Observer status updates" className="min-h-0 flex-1">
				<div className="flex min-h-full min-w-0 flex-col gap-3 px-5.5 py-4 max-md:px-4.5">
					{notice !== null && (
						<p role="status" className="border-b border-border pb-3 text-xs leading-relaxed text-warning">
							{notice}
						</p>
					)}
					{observerError !== null && (
						<FailureState
							variant="section"
							title="The observer could not update the status."
							description="The last update stays available. Follow the error details before new session activity."
							detail={observerError}
						/>
					)}
					{history.length === 0 ? (
						<>
							<h2 className="text-sm font-medium">Updates</h2>
							<span className="text-xs text-fg-faint">No update yet</span>
							<EmptyState
								image={null}
								title="The observer has not supplied a status update yet."
								description="Its first update will appear here. You can read the session transcript while you wait."
								variant="section"
							/>
						</>
					) : (
						<StatusTimeline updates={history} now={now} renderMarkdown={renderMarkdown} onOpenLink={onOpenLink} />
					)}
					<HistoryControls historyControl={historyControl} />
					<details className="mt-auto text-xs leading-relaxed text-fg-faint">
						<summary className="flex min-h-7 w-fit cursor-pointer items-center rounded-sm text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 max-md:min-h-11">
							How updates work
						</summary>
						<p className="mt-2.5">
							The observer reads completed session activity and writes a rich update. Select an update to read it. A
							paused session receives no update.
						</p>
					</details>
				</div>
			</ScrollArea>
		</SessionStatusPaneShell>
	);
}
