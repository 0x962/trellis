import { CaretDown, CaretRight } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { useApp } from "../../../lib/appContext";
import { formatCount } from "../../../lib/format";
import { useSessionStatuses } from "../../agents/useSessionStatuses";
import { SessionRow } from "../components/SessionRow";

// The sessions a person put away, under the session list. The group opens on
// a press and holds the same row as the session list above it, so an archived
// session takes the same actions. An archived session holds no project.
export function ArchivedSessions() {
	const { orpc } = useApp();
	const { data } = useQuery(orpc.sessions.list.queryOptions({ input: {} }));
	const statuses = useSessionStatuses();
	const pathname = useRouterState({ select: (state) => (state.resolvedLocation ?? state.location).pathname });
	const [open, setOpen] = useState(false);
	const rows = (data ?? []).filter((session) => session.projectId === null && session.archivedAt !== null);
	if (rows.length === 0) return null;
	return (
		<nav aria-label="Archived sessions" className="pt-1">
			<button
				type="button"
				aria-expanded={open}
				onClick={() => setOpen(!open)}
				className="sidebar-row w-full pl-2 text-left text-sm text-fg-muted hover:bg-elevated hover:text-fg active:bg-elevated focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2"
			>
				<span aria-hidden="true" className="sidebar-leading text-fg-faint *:size-3">
					{open ? <CaretDown /> : <CaretRight />}
				</span>
				<span className="sidebar-label">Archived</span>
				<span className="sidebar-trailing text-fg-faint">{formatCount(rows.length)}</span>
			</button>
			{open && (
				<ul className="flex flex-col gap-0.5">
					{rows.map((session) => (
						<SessionRow
							key={session.id}
							session={session}
							status={statuses?.[session.id] ?? "unavailable"}
							active={pathname === `/sessions/${session.id}`}
						/>
					))}
				</ul>
			)}
		</nav>
	);
}
