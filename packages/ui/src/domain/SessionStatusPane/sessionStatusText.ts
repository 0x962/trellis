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
