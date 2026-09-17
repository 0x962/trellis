import { List, Plus } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import type { Project } from "@trellis/api";
import { EmptyState, IconButton, Sheet, Tooltip, useMediaQuery } from "@trellis/ui";
import { useEffect, useState } from "react";
import { useApp } from "../../../lib/appContext";
import { PageTitle } from "../../shell/PageTitle";
import { ProjectBreadcrumb } from "../../shell/ProjectBreadcrumb";
import { Topbar } from "../../shell/Topbar";
import { SessionConversation } from "../SessionConversation";
import { sessionComposerActions } from "../sessionComposerStore";
import { SessionGroup } from "./components/SessionGroup";
import { SessionTicketSheet } from "./components/SessionTicketSheet";
import { sessionGroups } from "./sessionGroups";

export function ProjectSessionsPage({ project }: { project: Project }) {
	const { orpc } = useApp();
	useEffect(() => {
		document.title = `${project.name} sessions · trellis`;
	}, [project.name]);
	const navigate = useNavigate();
	const [ticketOpen, setTicketOpen] = useState(false);
	const [listOpen, setListOpen] = useState(false);
	const phone = useMediaQuery("(max-width: 767px)");
	const hash = useRouterState({ select: (state) => state.location.hash });
	const runs = useQuery({
		...orpc.agentRuns.list.queryOptions({ input: { project: project.id } }),
		refetchInterval: 2000,
	});
	const sessions = useQuery(orpc.sessions.list.queryOptions({ input: {} }));
	const items = (runs.data ?? []).filter(
		(run) => run.kind !== "session" || sessions.data?.some((session) => session.runId === run.id),
	);
	const { current, archived } = sessionGroups(items);
	const selected = hash ? items.find((run) => run.id === hash) : (current[0] ?? archived[0]);
	const open = (id: string) => {
		setTicketOpen(false);
		setListOpen(false);
		return navigate({ to: "/sessions/project/$project", params: { project: project.path }, hash: id });
	};
	const sessionList = (
		<nav aria-label="Project sessions" className="flex w-full min-h-0 flex-col overflow-y-auto py-2">
			{(runs.isPending || sessions.isPending) && (
				<p role="status" className="px-3 text-sm text-fg-muted">
					Load sessions…
				</p>
			)}
			{(runs.error || sessions.error) && (
				<p role="alert" className="px-3 text-sm text-danger">
					{runs.error?.message ?? sessions.error?.message}
				</p>
			)}
			{!runs.isPending && !sessions.isPending && !runs.isError && !sessions.isError && (
				<>
					<SessionGroup
						group="current"
						label="Current"
						projectPath={project.path}
						runs={current}
						selectedId={selected?.id}
						onSelect={(id) => void open(id)}
					/>
					{archived.length > 0 && (
						<SessionGroup
							group="archived"
							label="Archived"
							projectPath={project.path}
							runs={archived}
							selectedId={selected?.id}
							onSelect={(id) => void open(id)}
						/>
					)}
				</>
			)}
		</nav>
	);
	return (
		<>
			<Topbar
				actions={
					<>
						{phone && (
							<Tooltip content="Session list">
								<IconButton label="Session list" icon={<List />} onClick={() => setListOpen(true)} />
							</Tooltip>
						)}
						<Tooltip content="New session">
							<IconButton
								label="New session"
								icon={<Plus />}
								disabled={project.archivedAt !== null}
								onClick={() => sessionComposerActions.open(project.path)}
							/>
						</Tooltip>
					</>
				}
			>
				<PageTitle parent={<ProjectBreadcrumb project={project} />} title="Sessions" />
			</Topbar>
			<div className="page-card flex min-h-0 flex-1 overflow-hidden">
				{!phone && <div className="flex w-64 shrink-0 border-r border-border">{sessionList}</div>}
				{selected ? (
					<SessionConversation
						key={selected.id}
						run={selected}
						session={sessions.data?.find((session) => session.runId === selected.id)}
						readOnly={project.archivedAt !== null}
						onDeleted={() => void open("")}
						onOpenTicket={selected.ticketIdentifier ? () => setTicketOpen(true) : undefined}
					/>
				) : runs.isPending || sessions.isPending ? (
					<p role="status" className="p-4 text-sm text-fg-muted">
						Load sessions…
					</p>
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
				<Sheet open={listOpen} title="Sessions" side="left" onOpenChange={setListOpen}>
					{sessionList}
				</Sheet>
			)}
			{selected?.ticketIdentifier && (
				<SessionTicketSheet
					key={selected.id}
					identifier={selected.ticketIdentifier}
					open={ticketOpen}
					onClose={() => setTicketOpen(false)}
				/>
			)}
		</>
	);
}
