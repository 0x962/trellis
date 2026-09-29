export const nextUsageChartFocusIndex = (key: string, index: number, count: number) => {
	if (count === 0) return null;
	if (key === "ArrowLeft") return Math.max(0, index - 1);
	if (key === "ArrowRight") return Math.min(count - 1, index + 1);
	if (key === "Home") return 0;
	if (key === "End") return count - 1;
	return null;
};

export const isUsageChartSelectKey = (key: string) => key === "Enter" || key === " ";
