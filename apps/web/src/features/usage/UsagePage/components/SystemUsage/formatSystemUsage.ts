const byteUnits = ["B", "KB", "MB", "GB", "TB"] as const;

export const formatBytes = (bytes: number) => {
	if (bytes === 0) return "0 B";
	const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), byteUnits.length - 1);
	const value = bytes / 1024 ** unit;
	return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: value >= 10 ? 0 : 1 }).format(value)} ${byteUnits[unit]}`;
};

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
