import type { Session } from "@trellis/api";
import type { AppContext } from "../../lib/appContext";

// The sidebar uses the shared query key for the complete session list.
export const sidebarSessionsQuery = (orpc: AppContext["orpc"]) => orpc.sessions.list.queryOptions({ input: {} });

// Only unarchived standalone sessions belong in the sidebar.
export const openSessions = (sessions: readonly Session[]) =>
	sessions
		.filter((session) => session.projectId === null && session.archivedAt === null)
		.toSorted(
			(a, b) =>
				Number(b.pinnedAt !== null) - Number(a.pinnedAt !== null) ||
				b.createdAt.localeCompare(a.createdAt) ||
				b.id.localeCompare(a.id),
		);
