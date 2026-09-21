import { List, Plus } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import type { Project } from "@trellis/api";
import { EmptyState, Sheet, Tooltip, useMediaQuery } from "@trellis/ui";
import { useEffect, useRef, useState } from "react";
import { useApp } from "../../../lib/appContext";
import { pageSheetActions } from "../../../stores/pageSheetStore";
import { PageTitle } from "../../shell/PageTitle";
import { ProjectBreadcrumb } from "../../shell/ProjectBreadcrumb";
import { Topbar, TopbarActionButton } from "../../shell/Topbar";
import { SessionConversation } from "../SessionConversation";
import { sessionComposerActions } from "../sessionComposerStore";
import { SessionList } from "./components/SessionList";
import { sessionGroups } from "./sessionGroups";

export function ProjectSessionsPage({ project }: { project: Project }) {
	const { orpc } = useApp();
	useEffect(() => {
		document.title = `${project.name} sessions · trellis`;
	}, [project.name]);
	const navigate = useNavigate();
	const conversationHeading = useRef<HTMLHeadingElement>(null);
	const returnToConversation = useRef(false);
	const [listOpen, setListOpen] = useState(false);
	const phone = useMediaQuery("(max-width: 767px)");
	const hash = useRouterState({ select: (state) => state.location.hash });
	const runs = useQuery({
		...orpc.agentRuns.list.queryOptions({ input: { project: project.id } }),
		refetchInterval: 2000,
	});
	const sessions = useQuery(orpc.sessions.list.queryOptions({ input: {} }));
	const items = (runs.data ?? []).filter(
		(run) =>
			run.kind !== "flow" && (run.kind !== "session" || sessions.data?.some((session) => session.runId === run.id)),
	);
	const groups = sessionGroups(items, { search: "", history: false });
	const selected = hash ? items.find((run) => run.id === hash) : (groups.sessions[0] ?? groups.ticketed[0] ?? items[0]);
	const open = (id: string) => {
		returnToConversation.current = true;
		setListOpen(false);
		return navigate({ to: "/sessions/project/$project", params: { project: project.path }, hash: id });
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
			onSelect={(id) => void open(id)}
			onConversation={() => {
				returnToConversation.current = true;
				setListOpen(false);
				if (!phone) conversationHeading.current?.focus();
			}}
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
									onClick={() => sessionComposerActions.open(project.path)}
								/>
							</Tooltip>
						)}
					</>
				}
			>
				<PageTitle parent={<ProjectBreadcrumb project={project} showName />} title="Sessions" />
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
