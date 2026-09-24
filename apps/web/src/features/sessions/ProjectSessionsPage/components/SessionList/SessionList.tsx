import { ClockCounterClockwise, Plus } from "@phosphor-icons/react";
import type { AgentRun, Project, Session } from "@trellis/api";
import { Button, IconButton, Input, Tooltip } from "@trellis/ui";
import { useLayoutEffect, useRef, useState } from "react";
import { sessionComposerActions } from "../../../sessionComposerStore";
import { sessionGroups } from "../../sessionGroups";
import { SessionGroup } from "../SessionGroup";

export function SessionList({
	project,
	runs,
	sessions,
	selectedId,
	pending,
	error,
	failed,
	onRetry,
	onSelect,
	onConversation,
	history,
	onHistoryChange,
}: {
	project: Project;
	runs: AgentRun[];
	sessions: Session[];
	selectedId?: string;
	pending: boolean;
	error?: string;
	failed: boolean;
	onRetry: () => void;
	onSelect: (id: string) => void;
	onConversation: () => void;
	history: boolean;
	onHistoryChange: (history: boolean) => void;
}) {
	const [search, setSearch] = useState("");
	// The one element of this page that scrolls the rows. Each group draws
	// the rows this box shows and no others.
	const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
	// Each group holds the distance from the top of the scrolled content to
	// its own first row. A change of the content height moves that distance,
	// so this counter tells both groups to measure it again.
	const content = useRef<HTMLDivElement>(null);
	const [layout, setLayout] = useState(0);
	useLayoutEffect(() => {
		const observer = new ResizeObserver(() => setLayout((count) => count + 1));
		observer.observe(content.current!);
		return () => observer.disconnect();
	}, []);
	const groups = sessionGroups(runs, { search, history, selectedId });
	const sessionsByRunId = new Map(sessions.map((session) => [session.runId, session]));
	return (
		<nav aria-label="Project sessions" className="relative flex h-full min-h-0 w-full flex-col bg-bg">
			{selectedId && (
				<button type="button" className="skip-link" onClick={onConversation}>
					Skip to conversation
				</button>
			)}
			<div className="flex min-h-11 shrink-0 items-center gap-1 border-b border-border px-2">
				<div className="min-w-0 flex-1">
					<Input
						label="Search all sessions"
						hideLabel
						placeholder="Search sessions…"
						value={search}
						onChange={(event) => setSearch(event.target.value)}
						className="h-7 text-sm"
					/>
				</div>
				<Tooltip content={history ? "Hide history" : `Show history (${groups.historyCount})`}>
					<IconButton
						variant="default"
						label={history ? "Hide history" : "Show history"}
						icon={<ClockCounterClockwise />}
						pressed={history}
						onClick={() => onHistoryChange(!history)}
					/>
				</Tooltip>
				<Tooltip content="New session">
					<IconButton
						variant="default"
						label="New session"
						icon={<Plus />}
						disabled={project.archivedAt !== null}
						onClick={() => sessionComposerActions.open(project.key)}
					/>
				</Tooltip>
			</div>
			<div ref={setScroller} className="min-h-0 flex-1 overflow-y-auto py-2">
				<div ref={content}>
					{pending && !failed && (
						<p role="status" className="px-4 py-2 text-sm text-fg-muted">
							Load sessions…
						</p>
					)}
					{failed && (
						<div role="status" className="flex items-center justify-between gap-3 px-4 py-2 text-sm text-fg-muted">
							<span>Could not load sessions</span>
							<Button onClick={onRetry}>Retry</Button>
						</div>
					)}
					{error && !failed && (
						<p role="alert" className="px-4 py-2 text-sm text-danger">
							{error}
						</p>
					)}
					{!pending && !error && !failed && (
						<>
							{search.trim() && (
								<p role="status" className="px-4 pb-1 text-xs text-fg-muted">
									{groups.sessions.length + groups.ticketed.length} results across all sessions
								</p>
							)}
							{groups.sessions.length + groups.ticketed.length === 0 ? (
								<p className="px-4 py-3 text-sm text-fg-muted">
									{search.trim() ? "No matching sessions." : "No current sessions. Start one or show history."}
								</p>
							) : (
								<>
									{groups.sessions.length > 0 && (
										<SessionGroup
											key={`sessions:${search}:${history}`}
											group="sessions"
											searching={Boolean(search.trim())}
											label="Sessions"
											projectKey={project.key}
											runs={groups.sessions}
											scroller={scroller}
											layout={layout}
											sessionsByRunId={sessionsByRunId}
											selectedId={selectedId}
											onSelect={onSelect}
										/>
									)}
									{groups.ticketed.length > 0 && (
										<SessionGroup
											key={`ticketed:${search}:${history}`}
											group="ticketed"
											searching={Boolean(search.trim())}
											label="Ticketed"
											projectKey={project.key}
											runs={groups.ticketed}
											scroller={scroller}
											layout={layout}
											sessionsByRunId={sessionsByRunId}
											selectedId={selectedId}
											onSelect={onSelect}
										/>
									)}
								</>
							)}
						</>
					)}
				</div>
			</div>
		</nav>
	);
}
