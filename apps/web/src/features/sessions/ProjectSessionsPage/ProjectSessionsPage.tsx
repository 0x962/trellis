import { List, Plus } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import type { Project } from "@trellis/api";
import { Button, EmptyState, Sheet, Tooltip, useMediaQuery } from "@trellis/ui";
import { useEffect, useRef, useState } from "react";
import { useApp } from "../../../lib/appContext";
import { pageSheetActions } from "../../../stores/pageSheetStore";
import { PageTitle } from "../../shell/PageTitle";
import { ProjectBreadcrumb } from "../../shell/ProjectBreadcrumb";
import { ProjectSectionMenu } from "../../shell/ProjectSectionMenu";
import { Topbar, TopbarActionButton } from "../../shell/Topbar";
import { SessionConversation } from "../SessionConversation";
import { sessionComposerActions } from "../sessionComposerStore";
import { SessionList } from "./components/SessionList";
import { selectedSession, sessionGroups } from "./sessionGroups";

export function ProjectSessionsPage({ project }: { project: Project }) {
	const { orpc, queryClient } = useApp();
	useEffect(() => {
		document.title = `${project.name} sessions · trellis`;
	}, [project.name]);
	const navigate = useNavigate();
	const conversationHeading = useRef<HTMLHeadingElement>(null);
	const returnToConversation = useRef(false);
	const [listOpen, setListOpen] = useState(false);
	const [history, setHistory] = useState(false);
	const [heldSelectedId, setHeldSelectedId] = useState<string>();
	const phone = useMediaQuery("(max-width: 767px)");
	const hash = useRouterState({ select: (state) => state.location.hash });
	// The list asks for what it draws. Closed runs sit behind the history
	// button, and the page asks for a month of them only while that button is
	// pressed. The two second timer runs on the short list. The history list
	// holds a month of closed runs, which do not change, and the event stream
	// still refreshes it when a run in it changes.
	const runsOptions = orpc.agentRuns.list.queryOptions({
		input: history
			? { project: project.id, includePinnedHistory: true, windowHours: 24 * 30, limit: 1000 }
			: { project: project.id, includePinnedHistory: true },
	});
	const sessionsOptions = orpc.sessions.list.queryOptions({ input: {} });
	const runs = useQuery({
		...runsOptions,
		refetchInterval: history ? false : 2000,
	});
	const sessions = useQuery(sessionsOptions);
	const sessionsFailed =
		(runs.data === undefined && runs.failureCount > 0) || (sessions.data === undefined && sessions.failureCount > 0);
	const retrySessions = () => {
		void queryClient.resetQueries({ queryKey: runsOptions.queryKey, exact: true });
		void queryClient.resetQueries({ queryKey: sessionsOptions.queryKey, exact: true });
	};
	const items = (runs.data ?? []).filter(
		(run) =>
			run.kind !== "flow" && (run.kind !== "session" || sessions.data?.some((session) => session.runId === run.id)),
	);
	const groups = sessionGroups(items, { search: "", history: false });
	const selected = selectedSession(items, [...groups.sessions, ...groups.ticketed], hash, heldSelectedId);
	useEffect(() => {
		if (!hash && selected?.id !== heldSelectedId) setHeldSelectedId(selected?.id);
	}, [hash, heldSelectedId, selected?.id]);
	const open = (id: string) => {
		returnToConversation.current = true;
		setListOpen(false);
		return navigate({ to: "/sessions/project/$project", params: { project: project.key }, hash: id });
	};
	const sessionList = (
		<SessionList
			key={project.id}
			project={project}
			runs={items}
			sessions={sessions.data ?? []}
			selectedId={selected?.id}
			pending={runs.isPending || sessions.isPending}
			error={runs.error?.message ?? sessions.error?.message}
			failed={sessionsFailed}
			onRetry={retrySessions}
			onSelect={(id) => void open(id)}
			onConversation={() => {
				returnToConversation.current = true;
				setListOpen(false);
				if (!phone) conversationHeading.current?.focus();
			}}
			history={history}
			onHistoryChange={setHistory}
		/>
	);
	return (
		<>
			<Topbar
				actions={
					<>
						{phone && (
							<Tooltip content="Session list">
								<TopbarActionButton
									label="Session list"
									icon={<List />}
									onClick={() => {
										returnToConversation.current = false;
										setListOpen(true);
									}}
								/>
							</Tooltip>
						)}
						{phone && (
							<Tooltip content="New session">
								<TopbarActionButton
									label="New session"
									icon={<Plus />}
									disabled={project.archivedAt !== null}
									onClick={() => sessionComposerActions.open(project.key)}
								/>
							</Tooltip>
						)}
					</>
				}
			>
				<PageTitle
					parent={<ProjectBreadcrumb project={project} showName />}
					title={<ProjectSectionMenu projectKey={project.key} current="sessions" />}
				/>
			</Topbar>
			<div className="page-card flex min-h-0 flex-1 overflow-hidden">
				{!phone && <div className="flex w-72 shrink-0 border-r border-border">{sessionList}</div>}
				{selected ? (
					<SessionConversation
						key={selected.id}
						run={selected}
						headingRef={conversationHeading}
						session={sessions.data?.find((session) => session.runId === selected.id)}
						readOnly={project.archivedAt !== null}
						onDeleted={() => void open("")}
						onOpenTicket={
							selected.ticketIdentifier ? () => pageSheetActions.openTicket(selected.ticketIdentifier!) : undefined
						}
					/>
				) : runs.isPending || sessions.isPending ? (
					<p role="status" className="p-4 text-sm text-fg-muted">
						Load sessions…
					</p>
				) : sessionsFailed ? (
					<EmptyState
						variant="page"
						title="Could not load sessions"
						action={
							<Button variant="primary" size="md" onClick={retrySessions}>
								Retry
							</Button>
						}
					/>
				) : runs.isError || sessions.isError ? (
					<EmptyState
						variant="page"
						title="Sessions unavailable"
						description={runs.error?.message ?? sessions.error?.message}
					/>
				) : (
					<EmptyState
						variant="page"
						title={hash ? "Session not found" : "No sessions yet"}
						description={
							hash
								? "Select a session from the list."
								: "Start a session with the plus button. Ticket agents also appear here."
						}
					/>
				)}
			</div>
			{phone && (
				<Sheet
					open={listOpen}
					title="Sessions"
					side="left"
					onOpenChange={setListOpen}
					finalFocus={() => {
						if (!returnToConversation.current) return true;
						returnToConversation.current = false;
						return conversationHeading.current;
					}}
				>
					{sessionList}
				</Sheet>
			)}
		</>
	);
}
