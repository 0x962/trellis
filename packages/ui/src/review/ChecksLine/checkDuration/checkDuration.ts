// How long a check took, in words such as `2m 14s`. The words are empty when
// the check carries no start, when it has not ended, or when the two stamps
// are not two readable times. A check that ran under one second reads `0s`,
// because a check that ran at all did take time.
export function checkDuration(startedAt: string | null, endedAt: string | null): string {
	if (startedAt === null || endedAt === null) return "";
	const from = Date.parse(startedAt);
	const to = Date.parse(endedAt);
	if (Number.isNaN(from) || Number.isNaN(to) || to < from) return "";
	const seconds = Math.round((to - from) / 1000);
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
	return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
