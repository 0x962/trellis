import type { SessionStatusProcessState, SessionUpdateRequest } from "./types";

export function sessionStatusNotice({
	processState,
	request,
	latestAt,
}: {
	processState: SessionStatusProcessState;
	request: SessionUpdateRequest | null;
	latestAt: string | null;
}) {
	if (processState === "completed") return null;
	if (processState === "paused")
		return latestAt === null
			? "The session is paused. No observer update is available yet."
			: "The session is paused. This is the last update from the observer.";
	if (request?.state === "failed")
		return latestAt === null
			? "The observer update failed. No observer update is available yet."
			: "The observer update failed. The last update stays below.";
	if (request?.state !== "pending" && request?.state !== "sent") return null;
	return latestAt === null
		? "The observer prepares the first update."
		: "The observer prepares a new update. The last update stays below.";
}
