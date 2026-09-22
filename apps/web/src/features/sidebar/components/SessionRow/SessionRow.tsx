import { Link } from "@tanstack/react-router";
import { type Session, type SessionStatus, sessionStatusLabels } from "@trellis/api";
import { Avatar, cx } from "@trellis/ui";
import { lazy, Suspense } from "react";
import { compactRelativeTime } from "../../../../lib/format";
import { agentProfileOf } from "../../../agents/agentProfileOf";

const SessionRowActions = lazy(async () => ({ default: (await import("../../SessionRowActions")).SessionRowActions }));

export type SessionRowProps = {
	session: Session;
	status: SessionStatus;
	activityAt: string;
	workingCount?: number;
	// True on the page of this session.
	active: boolean;
};

export function SessionRow({ session, status, activityAt, workingCount = 0, active }: SessionRowProps) {
	const activity = compactRelativeTime(activityAt);
	return (
		<li
			className={cx(
				"group/row sidebar-row relative pl-2 text-sm font-medium text-fg hover:bg-elevated",
				active && "sidebar-selected",
			)}
		>
			<Link
				to="/sessions/$id"
				params={{ id: session.id }}
				aria-current={active ? "page" : undefined}
				className="flex h-8 min-w-0 flex-1 items-center rounded-md transition-colors duration-hover ease-out hover:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2 pointer-coarse:h-11"
			>
				<span aria-hidden="true" className="sidebar-leading">
					<Avatar
						kind="agent"
						name={session.name}
						agentKind="agent"
						agentProfile={agentProfileOf(session.harness)}
						state={workingCount > 0 ? "working" : "static"}
						status={status}
						className="size-5"
					/>
				</span>
				<span className="sr-only">{sessionStatusLabels[status]}: </span>
				<span
					data-slot="label"
					title={`${session.name} · ${sessionStatusLabels[status]} · Last activity ${activity}`}
					className="sidebar-label"
				>
					{session.name}
				</span>
				<span className="shrink-0 px-1 text-xs text-fg-faint tabular">
					<span className="sr-only">Last activity </span>
					{activity}
				</span>
				<span data-slot="trailing" className="sidebar-trailing" aria-hidden="true" />
			</Link>
			<span
				data-slot="menu"
				className="absolute top-1 right-1 flex size-6 pointer-coarse:top-0 pointer-coarse:size-11 items-center justify-center opacity-0 transition-opacity duration-hover ease-out group-focus-within/row:opacity-100 group-hover/row:opacity-100 has-[[data-popup-open]]:opacity-100 [@media(hover:none)]:opacity-100"
			>
				<Suspense fallback={null}>
					<SessionRowActions session={session} />
				</Suspense>
			</span>
		</li>
	);
}
