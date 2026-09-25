import { CaretDown, CaretRight, Plus } from "@phosphor-icons/react";
import type { AgentRun, Project, Session } from "@trellis/api";
import { Button, IconButton, Input, Tooltip } from "@trellis/ui";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { sessionComposerActions } from "../../../sessionComposerStore";
import { nextSessionArchiveAt, sessionGroups } from "../../sessionGroups";
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
	archived,
	onArchivedChange,
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
	archived: boolean;
	onArchivedChange: (archived: boolean) => void;
}) {
	const [search, setSearch] = useState("");
	// The one element of this page that scrolls the rows. The virtual list
	// draws the rows this box shows and no others.
	const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
	// A change of the content height moves the first row. This counter tells
	// the virtual list to measure that distance again.
	const content = useRef<HTMLDivElement>(null);
	const [layout, setLayout] = useState(0);
	const [, setArchiveClock] = useState(Date.now());
	useLayoutEffect(() => {
		const observer = new ResizeObserver(() => setLayout((count) => count + 1));
		observer.observe(content.current!);
		return () => observer.disconnect();
	}, []);
	useEffect(() => {
		const archiveAt = nextSessionArchiveAt(runs);
		if (archiveAt === null) return;
		const timer = window.setTimeout(
			() => setArchiveClock(Date.now()),
			Math.min(archiveAt - Date.now() + 1, 2_147_483_647),
		);
		return () => window.clearTimeout(timer);
	}, [runs]);
	const groups = sessionGroups(runs, { search, archived });
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
									{groups.runs.length} results in {archived ? "Archived" : "current sessions"}
								</p>
							)}
							{groups.runs.length === 0 ? (
								<p className="px-4 py-3 text-sm text-fg-muted">
									{search.trim()
										? "No matching sessions."
										: archived
											? "No archived sessions."
											: "No current sessions. Start one."}
								</p>
							) : (
								<SessionGroup
									key={`${archived}:${search}`}
									group="sessions"
									label="Sessions"
									projectKey={project.key}
									searching={Boolean(search.trim())}
									header={false}
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
				<button
					type="button"
					aria-pressed={archived}
					onClick={() => onArchivedChange(!archived)}
					className="sidebar-row w-full text-left text-sm text-fg-muted hover:bg-elevated hover:text-fg active:bg-elevated focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2"
				>
					<span aria-hidden="true" className="sidebar-leading text-fg-faint *:size-3">
						{archived ? <CaretDown /> : <CaretRight />}
					</span>
					<span className="sidebar-label">Archived</span>
				</button>
			</div>
		</nav>
	);
}
