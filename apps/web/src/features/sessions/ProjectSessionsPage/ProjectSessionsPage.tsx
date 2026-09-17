import { Plus } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import type { Project } from "@trellis/api";
import { Avatar, cx, EmptyState, IconButton, Tooltip } from "@trellis/ui";
import { useEffect } from "react";
import { useApp } from "../../../lib/appContext";
import { agentKindOf } from "../../agents/agentKindOf";
import { agentProfileOf } from "../../agents/agentProfileOf";
import { isAgentWorking } from "../../agents/isAgentWorking";
import { PageTitle } from "../../shell/PageTitle";
import { ProjectBreadcrumb } from "../../shell/ProjectBreadcrumb";
import { Topbar } from "../../shell/Topbar";
import { SessionConversation } from "../SessionConversation";
import { sessionComposerActions } from "../sessionComposerStore";

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
	const selected = hash ? items.find((run) => run.id === hash) : items[0];
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
					className="flex w-48 shrink-0 flex-col overflow-y-auto border-r border-border py-2 max-md:w-32"
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
					<ul className="flex flex-col">
						{items.map((run) => (
							<li key={run.id}>
								<button
									type="button"
									title={`${run.ticketIdentifier ?? run.name} · ${run.state} · ${run.createdAt}`}
									aria-current={selected?.id === run.id ? "page" : undefined}
									className={cx(
										"sidebar-row w-full text-left text-sm hover:bg-elevated focus-visible:outline-2 focus-visible:outline-accent",
										selected?.id === run.id && "sidebar-selected",
									)}
									onClick={() => void open(run.id)}
								>
									<Avatar
										kind="agent"
										name={run.ticketIdentifier ?? run.name}
										agentKind={agentKindOf(run.kind)}
										agentProfile={agentProfileOf(run.harness)}
										state={isAgentWorking(run) ? "working" : "static"}
										className="size-5 shrink-0"
									/>
									<span className="sidebar-label tabular">{run.ticketIdentifier ?? run.name}</span>
								</button>
							</li>
						))}
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
