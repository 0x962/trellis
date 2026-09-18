import type { HarnessAccountQuota } from "@trellis/api";
import { z } from "zod";

type Window = HarnessAccountQuota["windows"][number];

const percent = (value: number) => Math.max(0, Math.round(value));

const claudeWindow = z.object({
	utilization: z.number().optional(),
	resets_at: z.string().nullable().optional(),
});

const claudeUsageSchema = z.object({
	five_hour: claudeWindow.nullish(),
	seven_day: claudeWindow.nullish(),
	seven_day_opus: claudeWindow.nullish(),
	seven_day_sonnet: claudeWindow.nullish(),
	limits: z
		.array(
			z.object({
				kind: z.string().nullish(),
				percent: z.number().nullish(),
				resets_at: z.string().nullish(),
				scope: z.object({ model: z.object({ display_name: z.string().nullish() }).nullish() }).nullish(),
			}),
		)
		.nullish(),
	extra_usage: z.object({ monthly_limit: z.number().nullish(), used_credits: z.number().nullish() }).nullish(),
});

const toClaudeWindow = (id: string, label: string, value: z.infer<typeof claudeWindow> | null | undefined): Window[] =>
	value?.utilization !== undefined
		? [
				{
					id,
					label,
					usedPercent: percent(value.utilization),
					resetsAt: value.resets_at ?? null,
				},
			]
		: [];

export const claudeUsage = (value: unknown) => {
	const data = claudeUsageSchema.parse(value);
	const windows = [
		...toClaudeWindow("five_hour", "Session (5h)", data.five_hour),
		...toClaudeWindow("seven_day", "Weekly", data.seven_day),
		...toClaudeWindow("seven_day_opus", "Weekly · Opus", data.seven_day_opus),
		...toClaudeWindow("seven_day_sonnet", "Weekly · Sonnet", data.seven_day_sonnet),
	];
	for (const limit of data.limits ?? []) {
		if (limit.kind !== "weekly_scoped" || typeof limit.percent !== "number") continue;
		const modelName = limit.scope?.model?.display_name;
		if (!modelName) continue;
		const label = `Weekly · ${modelName}`;
		if (windows.some((window) => window.label === label)) continue;
		windows.push({
			id: `weekly_scoped:${modelName}`,
			label,
			usedPercent: percent(limit.percent),
			resetsAt: limit.resets_at ?? null,
		});
	}
	const extraUsage =
		typeof data.extra_usage?.used_credits === "number" && typeof data.extra_usage.monthly_limit === "number"
			? { usedCents: data.extra_usage.used_credits, limitCents: data.extra_usage.monthly_limit }
			: null;
	return { windows, extraUsage };
};

const codexWindow = z.object({
	used_percent: z.number().optional(),
	limit_window_seconds: z.number().optional(),
	reset_at: z.number().optional(),
	reset_after_seconds: z.number().optional(),
});

const codexRateLimit = z.object({
	primary_window: codexWindow.nullish(),
	secondary_window: codexWindow.nullish(),
});

const windowLabel = (seconds: number | undefined) => {
	if (seconds === undefined) return "Limit";
	const hours = Math.round(seconds / 3600);
	if (hours <= 5) return `Session (${hours}h)`;
	if (hours === 168) return "Weekly";
	if (hours % 24 === 0) return `${hours / 24}d`;
	return `${hours}h`;
};

const toCodexWindow = (
	id: string,
	labelSuffix: string,
	window: z.infer<typeof codexWindow> | null | undefined,
	now: number,
): Window[] => {
	if (!window || window.used_percent === undefined) return [];
	const label = labelSuffix
		? `${windowLabel(window.limit_window_seconds)} · ${labelSuffix}`
		: windowLabel(window.limit_window_seconds);
	return [
		{
			id,
			label,
			usedPercent: percent(window.used_percent),
			resetsAt:
				window.reset_at !== undefined
					? new Date(window.reset_at * 1000).toISOString()
					: window.reset_after_seconds !== undefined
						? new Date(now + window.reset_after_seconds * 1000).toISOString()
						: null,
		},
	];
};

export const codexUsage = (value: unknown, now: number) => {
	const data = z
		.object({
			email: z.string().nullish(),
			plan_type: z.string().nullish(),
			rate_limit: codexRateLimit.nullish(),
			additional_rate_limits: z
				.array(z.object({ limit_name: z.string().nullish(), rate_limit: codexRateLimit.nullish() }))
				.nullish(),
			credits: z.object({ balance: z.string().nullish() }).nullish(),
		})
		.parse(value);
	const windows = [
		...toCodexWindow("primary", "", data.rate_limit?.primary_window, now),
		...toCodexWindow("secondary", "", data.rate_limit?.secondary_window, now),
	];
	for (const [index, limit] of (data.additional_rate_limits ?? []).entries()) {
		const name = limit.limit_name ?? `limit_${index}`;
		windows.push(...toCodexWindow(`additional:${name}`, name, limit.rate_limit?.primary_window, now));
	}
	const balance = Number.parseFloat(data.credits?.balance ?? "");
	return {
		email: data.email ?? null,
		plan: data.plan_type ?? null,
		windows,
		creditsBalance: Number.isFinite(balance) ? balance : null,
	};
};
