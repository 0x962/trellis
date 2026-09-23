import { Link } from "@tanstack/react-router";
import { type Session, type SessionStatus, sessionStatusLabels } from "@trellis/api";
import { Avatar, cx } from "@trellis/ui";
import { lazy, memo, Suspense, useState } from "react";
import { agentProfileOf } from "../../../agents/agentProfileOf";
import { SessionName } from "../../../sessions/SessionName";

const SessionRowActions = lazy(async () => ({ default: (await import("../../SessionRowActions")).SessionRowActions }));

export type SessionRowProps = {
	session: Session;
	status: SessionStatus;
	// True on the page of this session.
	active: boolean;
};

export const SessionRow = memo(function SessionRow({ session, status, active }: SessionRowProps) {
	const [renaming, setRenaming] = useState(false);
	const avatar = (
		<Avatar
			kind="agent"
			name={session.name}
			agentKind="agent"
			agentProfile={agentProfileOf(session.harness)}
			state={status === "working" ? "working" : "static"}
			status={status}
			className="size-5"
		/>
	);
	return (
		<li
			className={cx(
				"group/row sidebar-row relative pl-2 text-sm font-medium text-fg hover:bg-elevated",
				active && "sidebar-selected",
			)}
		>
			<SessionName
				session={session}
				editing={renaming}
				onEditingChange={setRenaming}
				className="flex min-w-0 flex-1 items-center"
				fieldClassName="h-8 gap-1 pointer-coarse:h-11"
				inputClassName="h-7 text-sm"
				leading={
					// The avatar is 20 px and `sidebar-leading` is 16 px wide, so the
					// mark overflows its box and the text field would cover the
					// overflow. The negative margin and the 20 px box put the avatar
					// on the same centre as the one in the link below.
					<span aria-hidden="true" className="-ml-0.5 flex size-5 shrink-0 items-center justify-center">
						{avatar}
					</span>
				}
			>
				<Link
					to="/sessions/$id"
					params={{ id: session.id }}
					aria-current={active ? "page" : undefined}
					className="flex h-8 min-w-0 flex-1 items-center rounded-md transition-colors duration-hover ease-out hover:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2 pointer-coarse:h-11"
				>
					<span aria-hidden="true" className="sidebar-leading">
						{avatar}
					</span>
					<span className="sr-only">{sessionStatusLabels[status]}: </span>
					<span data-slot="label" title={`${session.name} · ${sessionStatusLabels[status]}`} className="sidebar-label">
						{session.name}
					</span>
					<span data-slot="trailing" className="sidebar-trailing" aria-hidden="true" />
				</Link>
			</SessionName>
			{!renaming && (
				<span
					data-slot="menu"
					className="absolute top-1 right-1 flex size-6 pointer-coarse:top-0 pointer-coarse:size-11 items-center justify-center opacity-0 transition-opacity duration-hover ease-out group-focus-within/row:opacity-100 group-hover/row:opacity-100 has-[[data-popup-open]]:opacity-100 [@media(hover:none)]:opacity-100"
				>
					<Suspense fallback={null}>
						<SessionRowActions session={session} onRename={() => setRenaming(true)} />
					</Suspense>
				</span>
			)}
		</li>
	);
});
