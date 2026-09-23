import { ClockCounterClockwise, Plus } from "@phosphor-icons/react";
import type { AgentRun, Project, Session } from "@trellis/api";
import { Button, IconButton, Input, Tooltip } from "@trellis/ui";
import { useState } from "react";
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
}) {
	const [search, setSearch] = useState("");
	const [history, setHistory] = useState(false);
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
						onClick={() => setHistory(!history)}
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
			<div className="min-h-0 flex-1 overflow-y-auto py-2">
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
		</nav>
	);
}
