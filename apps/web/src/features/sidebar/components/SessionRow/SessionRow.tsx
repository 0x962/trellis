import { Link } from "@tanstack/react-router";
import type { Session } from "@trellis/api";
import { Avatar, cx } from "@trellis/ui";
import { lazy, Suspense } from "react";

const SessionRowActions = lazy(async () => ({ default: (await import("../../SessionRowActions")).SessionRowActions }));

export type SessionRowProps = {
	session: Session;
	// True while the agent of the session works on a turn.
	working: boolean;
	// True on the page of this session.
	active: boolean;
};

// One session in the sidebar: the avatar of its agent with the work state,
// the name, and the row menu in the trailing slot on hover and focus. The
// row opens the session page.
export function SessionRow({ session, working, active }: SessionRowProps) {
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
						personaKind="builder"
						state={working ? "working-mild" : "static"}
						className="size-5"
					/>
				</span>
				{working && <span className="sr-only">Agent working: </span>}
				<span data-slot="label" title={session.name} className="sidebar-label">
					{session.name}
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
