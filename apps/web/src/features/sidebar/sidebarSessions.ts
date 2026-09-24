import type { Session } from "@trellis/api";
import type { AppContext } from "../../lib/appContext";

// The sessions of the sidebar. One request carries every session, and the two
// sections of the sidebar select from that one answer, so the app holds one
// cache entry and sends no second request.
export const sidebarSessionsQuery = (orpc: AppContext["orpc"]) => orpc.sessions.list.queryOptions({ input: {} });

// The sessions of the Sessions section. A session of a project lives on the
// sessions page of that project, and an archived session lives under
// Archived.
export const openSessions = (sessions: readonly Session[]) =>
	sessions.filter((session) => session.projectId === null && session.archivedAt === null);

// The sessions of the Archived section. The server archives no session that
// holds a project, so an archived session is always a top level session.
export const archivedSessions = (sessions: readonly Session[]) =>
	sessions.filter((session) => session.archivedAt !== null);
