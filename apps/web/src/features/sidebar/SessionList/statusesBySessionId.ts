import { type AgentActivity, type SessionStatus, sessionStatus } from "@trellis/api";

// A run carries fields that change on every check, such as
// observation.checkedAt. This function keeps only the status of each session,
// so React Query holds the last object and a row redraws only when a status
// somewhere changes.
export const statusesBySessionId = (entries: AgentActivity[]): Record<string, SessionStatus> =>
	Object.fromEntries(
		entries.flatMap((entry) =>
			entry.sessionId === null ? [] : [[entry.sessionId, sessionStatus(entry.run)] as const],
		),
	);
