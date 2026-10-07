import type { UsageDays } from "@trellis/api";

export const usageDays = (count: UsageDays) =>
	Array.from({ length: count }, (_, index) => {
		const day = new Date(Date.UTC(2026, 8, 30 - count + index + 1)).toISOString().slice(0, 10);
		const activeIndex = index - (count - 7);
		return {
			day,
			usd: activeIndex < 0 ? 0 : 2 + activeIndex,
			tokens: activeIndex < 0 ? 0 : (activeIndex + 1) * 16000,
		};
	});
