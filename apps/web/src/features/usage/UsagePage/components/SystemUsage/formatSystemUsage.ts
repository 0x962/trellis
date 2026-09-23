export const formatPercent = (percent: number) => `${percent.toFixed(1)}%`;

export const formatUptime = (seconds: number) => {
	const days = Math.floor(seconds / 86_400);
	const hours = Math.floor((seconds % 86_400) / 3_600);
	const minutes = Math.floor((seconds % 3_600) / 60);
	if (days > 0) return `${days}d ${hours}h`;
	if (hours > 0) return `${hours}h ${minutes}m`;
	return `${minutes}m`;
};

export const formatSampleTime = (value: string) =>
	new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
