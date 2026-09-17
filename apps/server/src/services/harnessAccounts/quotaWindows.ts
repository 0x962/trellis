import type { HarnessAccountQuota } from "@trellis/api";
import { z } from "zod";

type Window = HarnessAccountQuota["windows"][number];
export const claudeWindows = (value: unknown): Window[] => {
	const data = z.record(z.string(), z.unknown()).parse(value);
	const keys = {
		five_hour: "Session (5h)",
		seven_day: "Weekly",
		seven_day_opus: "Weekly Opus",
		seven_day_sonnet: "Weekly Sonnet",
	};
	return Object.entries(keys).flatMap(([id, label]) => {
		const parsed = z
			.object({ utilization: z.number(), resets_at: z.string().nullable().optional() })
			.safeParse(data[id]);
		return parsed.success
			? [{ id, label, usedPercent: parsed.data.utilization, resetsAt: parsed.data.resets_at ?? null }]
			: [];
	});
};
export const codexUsage = (value: unknown, now: number) => {
	const window = z.object({
		used_percent: z.number(),
		reset_at: z.number().optional(),
		reset_after_seconds: z.number().optional(),
	});
	const data = z
		.object({
			email: z.string().optional(),
			plan_type: z.string().optional(),
			rate_limit: z.object({ primary_window: window.nullish(), secondary_window: window.nullish() }).nullish(),
		})
		.parse(value);
	return {
		email: data.email ?? null,
		plan: data.plan_type ?? null,
		windows: Object.entries({
			primary: data.rate_limit?.primary_window,
			secondary: data.rate_limit?.secondary_window,
		}).flatMap(([id, w]) =>
			w
				? [
						{
							id,
							label: id === "primary" ? "Session" : "Weekly",
							usedPercent: w.used_percent,
							resetsAt:
								w.reset_at !== undefined
									? new Date(w.reset_at * 1000).toISOString()
									: w.reset_after_seconds !== undefined
										? new Date(now + w.reset_after_seconds * 1000).toISOString()
										: null,
						},
					]
				: [],
		),
	};
};
