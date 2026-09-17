import { CaretDown, CaretRight, Plus } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import type { AgentRun, Project } from "@trellis/api";
import { Avatar, cx, EmptyState, IconButton, Tooltip } from "@trellis/ui";
import { useEffect, useState } from "react";
import { useApp } from "../../../lib/appContext";
import { formatCount } from "../../../lib/format";
import { agentKindOf } from "../../agents/agentKindOf";
import { agentProfileOf } from "../../agents/agentProfileOf";
import { isAgentWorking } from "../../agents/isAgentWorking";
import { PageTitle } from "../../shell/PageTitle";
import { ProjectBreadcrumb } from "../../shell/ProjectBreadcrumb";
import { Topbar } from "../../shell/Topbar";
import { SessionConversation } from "../SessionConversation";
import { sessionComposerActions } from "../sessionComposerStore";
import { sessionGroups } from "./sessionGroups";

function SessionRunRow({
	run,
	selected,
	archived = false,
	onOpen,
}: {
	run: AgentRun;
	selected: boolean;
	archived?: boolean;
	onOpen: (id: string) => void;
}) {
	return (
		<li>
			<button
				type="button"
				title={`${run.ticketIdentifier ?? run.name} · ${run.state} · ${run.createdAt}`}
				aria-current={selected ? "page" : undefined}
				className={cx(
					"sidebar-row w-full pl-2 text-left text-sm hover:bg-elevated focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2",
					archived && "pl-5",
					selected && "sidebar-selected",
				)}
				onClick={() => onOpen(run.id)}
			>
				<span aria-hidden="true" className="sidebar-leading">
					<Avatar
						kind="agent"
						name={run.ticketIdentifier ?? run.name}
						agentKind={agentKindOf(run.kind)}
						agentProfile={agentProfileOf(run.harness)}
						state={isAgentWorking(run) ? "working" : "static"}
						className="size-5"
					/>
				</span>
				{isAgentWorking(run) && <span className="sr-only">Agent working: </span>}
				<span data-slot="label" className="sidebar-label tabular">
					{run.ticketIdentifier ?? run.name}
				</span>
				<span data-slot="trailing" className="sidebar-trailing" aria-hidden="true" />
			</button>
		</li>
	);
}

export function ProjectSessionsPage({ project }: { project: Project }) {
	const { orpc } = useApp();
	useEffect(() => {
		document.title = `${project.name} sessions · trellis`;
	}, [project.name]);
	const navigate = useNavigate();
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
	const selectedArchived = selected !== undefined && archived.some((run) => run.id === selected.id);
	const [archivedOpen, setArchivedOpen] = useState(false);
	useEffect(() => {
		if (selectedArchived) setArchivedOpen(true);
	}, [selectedArchived]);
	const open = (id: string) =>
		navigate({ to: "/sessions/project/$project", params: { project: project.path }, hash: id });
	return (
		<>
			<Topbar
				actions={
					<Tooltip content="New session">
						<IconButton
							label="New session"
							icon={<Plus />}
							disabled={project.archivedAt !== null}
							onClick={() => sessionComposerActions.open(project.path)}
						/>
					</Tooltip>
				}
			>
				<PageTitle parent={<ProjectBreadcrumb project={project} />} title="Sessions" />
			</Topbar>
			<div className="page-card flex min-h-0 flex-1 overflow-hidden">
				<nav
					aria-label="Project sessions"
					className="flex w-48 shrink-0 flex-col overflow-y-auto border-r border-border px-2 py-2 max-md:w-32"
				>
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
					<ul className="flex flex-col gap-0.5">
						{current.map((run) => (
							<SessionRunRow key={run.id} run={run} selected={selected?.id === run.id} onOpen={(id) => void open(id)} />
						))}
						{archived.length > 0 && (
							<li className={cx(current.length > 0 && "mt-1")}>
								<button
									type="button"
									aria-expanded={archivedOpen}
									aria-controls="archived-project-sessions"
									onClick={() => setArchivedOpen(!archivedOpen)}
									className="sidebar-row w-full pl-2 text-left text-sm text-fg-muted hover:bg-elevated hover:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2"
								>
									<span aria-hidden="true" className="sidebar-leading text-fg-faint *:size-3">
										{archivedOpen ? <CaretDown /> : <CaretRight />}
									</span>
									<span className="sidebar-label">Archived</span>
									<span className="sidebar-trailing text-fg-faint">{formatCount(archived.length)}</span>
								</button>
								{archivedOpen && (
									<ul id="archived-project-sessions" className="flex flex-col gap-0.5">
										{archived.map((run) => (
											<SessionRunRow
												key={run.id}
												run={run}
												archived
												selected={selected?.id === run.id}
												onOpen={(id) => void open(id)}
											/>
										))}
									</ul>
								)}
							</li>
						)}
					</ul>
				</nav>
				{selected ? (
					<SessionConversation
						key={selected.id}
						run={selected}
						session={sessions.data?.find((session) => session.runId === selected.id)}
						readOnly={project.archivedAt !== null}
						onDeleted={() => void open("")}
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
		</>
	);
}
