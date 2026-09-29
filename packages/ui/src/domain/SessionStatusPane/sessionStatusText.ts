import type { SessionStatusProcessState, SessionUpdateRequest } from "./types";

const minuteMs = 60_000;
const hourMs = 60 * minuteMs;
const dayMs = 24 * hourMs;

const elapsedMs = (timestamp: string, now: string) =>
	Math.max(0, new Date(now).getTime() - new Date(timestamp).getTime());

const countLabel = (count: number, unit: string) => `${count} ${unit}${count === 1 ? "" : "s"}`;

export function sessionUpdateAge(timestamp: string, now: string) {
	const elapsed = elapsedMs(timestamp, now);
	if (elapsed < minuteMs) return "Just now";
	if (elapsed < hourMs) return `${Math.floor(elapsed / minuteMs)} min ago`;
	if (elapsed < dayMs) return `${countLabel(Math.floor(elapsed / hourMs), "hour")} ago`;
	return `${countLabel(Math.floor(elapsed / dayMs), "day")} ago`;
}

const sessionUpdateDuration = (timestamp: string, now: string) => {
	const elapsed = elapsedMs(timestamp, now);
	if (elapsed < hourMs) return countLabel(Math.max(1, Math.floor(elapsed / minuteMs)), "minute");
	if (elapsed < dayMs) return countLabel(Math.floor(elapsed / hourMs), "hour");
	return countLabel(Math.floor(elapsed / dayMs), "day");
};

export function sessionStatusNotice({
	processState,
	request,
	latestAt,
	now,
	lateAfterMs,
}: {
	processState: SessionStatusProcessState;
	request: SessionUpdateRequest | null;
	latestAt: string | null;
	now: string;
	lateAfterMs: number;
}) {
	if (processState === "completed") return null;
	if (processState === "paused")
		return latestAt === null
			? "The session is paused. No agent update is available yet."
			: "The session is paused. This is the last update from the agent.";
	if (request?.state === "failed")
		return latestAt === null
			? "The status request failed. No agent reply is available yet; this does not mean the agent stopped."
			: "The status request failed. The last reply stays below; this does not mean the agent stopped.";
	if (request?.state !== "pending" && request?.state !== "sent") return null;
	if (elapsedMs(request.requestedAt, now) >= lateAfterMs) {
		return latestAt === null
			? `The update request is ${sessionUpdateDuration(request.requestedAt, now)} old. Trellis is waiting for the first reply.`
			: `This update is ${sessionUpdateDuration(latestAt, now)} old. Trellis is waiting for a new reply.`;
	}
	return latestAt === null
		? "An update was requested. The first agent reply will appear below."
		: "An update was requested. The last agent reply stays below.";
}
