import { type AgentActivity, type SessionStatus, sessionStatus } from "@trellis/api";

// A run carries fields that change on every check, such as
// observation.checkedAt. React Query compares what select returns, so this
// drops those fields and a session row redraws only when its own status
// changes.
export const statusesBySessionId = (entries: AgentActivity[]): Record<string, SessionStatus> =>
	Object.fromEntries(
		entries.flatMap((entry) =>
			entry.sessionId === null ? [] : [[entry.sessionId, sessionStatus(entry.run)] as const],
		),
	);
