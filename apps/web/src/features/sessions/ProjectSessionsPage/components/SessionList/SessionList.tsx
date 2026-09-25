import { Plus } from "@phosphor-icons/react";
import type { AgentRun, Project, Session } from "@trellis/api";
import { ArchivedToggle, Button, IconButton, Input, Tooltip } from "@trellis/ui";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
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
	showArchived,
	onShowArchivedChange,
	archiveClock,
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
	showArchived: boolean;
	onShowArchivedChange: (showArchived: boolean) => void;
	archiveClock: number;
}) {
	const [search, setSearch] = useState("");
	// The one element of this page that scrolls the rows. The virtual list
	// draws the rows this box shows and no others.
	const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
	// A change of the content height moves the first row. This counter tells
	// the virtual list to measure that distance again.
	const content = useRef<HTMLDivElement>(null);
	const [layout, setLayout] = useState(0);
	useLayoutEffect(() => {
		const observer = new ResizeObserver(() => setLayout((count) => count + 1));
		observer.observe(content.current!);
		return () => observer.disconnect();
	}, []);
	const groups = useMemo(
		() => sessionGroups(runs, { search, showArchived, now: archiveClock }),
		[runs, search, showArchived, archiveClock],
	);
	const sessionsByRunId = useMemo(() => new Map(sessions.map((session) => [session.runId, session])), [sessions]);
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
									{groups.runs.length} results in {showArchived ? "Archived" : "current sessions"}
								</p>
							)}
							{groups.runs.length === 0 ? (
								<p className="px-4 py-3 text-sm text-fg-muted">
									{search.trim()
										? "No matching sessions."
										: showArchived
											? "No archived sessions."
											: "No current sessions. Start one."}
								</p>
							) : (
								<SessionGroup
									key={`${showArchived}:${search}`}
									group="sessions"
									label="Sessions"
									projectKey={project.key}
									searching={Boolean(search.trim())}
									showHeader={false}
									runs={groups.runs}
									scroller={scroller}
									layout={layout}
									sessionsByRunId={sessionsByRunId}
									selectedId={selectedId}
									onSelect={onSelect}
								/>
							)}
						</>
					)}
				</div>
			</div>
			<div className="shrink-0 border-t border-border p-2">
				<ArchivedToggle expanded={showArchived} onExpandedChange={onShowArchivedChange} />
			</div>
		</nav>
	);
}
