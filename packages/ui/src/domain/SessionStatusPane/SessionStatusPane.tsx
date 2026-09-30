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
	resize,
	className,
}: SessionStatusPaneProps) {
	const notice =
		observerError === null
			? sessionStatusNotice({ processState, request: updates.request, latestAt: updates.latest?.createdAt ?? null })
			: null;
	const history =
		updates.history ?? [updates.latest, updates.previous].filter((update): update is SessionUpdate => update !== null);
	return (
		<SessionStatusPaneShell className={className} resize={resize}>
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
				</div>
			</ScrollArea>
		</SessionStatusPaneShell>
	);
}
