import type {
	SystemUsage,
	UsageAccount,
	UsageDays,
	UsageGroupBy,
	UsageGroupRow,
	UsageMergedWork,
	UsageMergedWorkInput,
	UsageRanking,
	UsageRankingInput,
	UsageReport,
	UsageReportInput,
	UsageSession,
} from "@trellis/api";
import { id, timestamp } from "./project";
import { projectResponses } from "./responses";

const usageDays = (count: UsageDays) =>
	Array.from({ length: count }, (_, index) => {
		const day = new Date(Date.UTC(2026, 8, 30 - count + index + 1)).toISOString().slice(0, 10);
		const activeIndex = index - (count - 7);
		return {
			day,
			usd: activeIndex < 0 ? 0 : 2 + activeIndex,
			tokens: activeIndex < 0 ? 0 : (activeIndex + 1) * 16000,
		};
	});

const days = usageDays(30);
const groupKeys = {
	ticket: "DEMO-40",
	agent: "reviewer",
	project: "DEMO",
	kind: "agent",
	account: "claude/default",
	model: "anthropic/claude-sonnet-5.5",
	harness: "claude",
};
export const usageSessions: UsageSession[] = [
	{
		sessionId: "storybook-usage-session",
		harness: "claude",
		model: "anthropic/claude-sonnet-5.5",
		label: "Review the interface",
		usd: 35,
		tokens: 448000,
		turns: 12,
		firstAt: "2026-09-24T12:00:00.000Z",
		lastAt: timestamp,
		approximate: false,
		run: {
			id: id(400),
			kind: "agent",
			name: "Interface reviewer",
			ticketIdentifier: "DEMO-40",
			ticketTitle: "Keep the ticket title readable",
			projectKey: "DEMO",
			account: "Default Claude",
		},
		groupKeys,
	},
];

const groupRow = (group: UsageGroupBy, values = days): UsageGroupRow => ({
	key: groupKeys[group],
	label: groupKeys[group],
	detail: group === "ticket" ? "Keep the ticket title readable" : null,
	href: group === "ticket" ? "/t/DEMO-40" : null,
	harness: "claude",
	usd: 35,
	tokens: 448000,
	sessions: 1,
	runs: 1,
	approximate: false,
	days: values,
});
const groupsForDays = (values = days) => ({
	ticket: [groupRow("ticket", values)],
	agent: [groupRow("agent", values)],
	project: [groupRow("project", values)],
	kind: [groupRow("kind", values)],
	account: [groupRow("account", values)],
	model: [groupRow("model", values)],
	harness: [groupRow("harness", values)],
});
const groups = groupsForDays();

export const usageReport: UsageReport = {
	days: 30,
	buckets: days.map((day) => ({ ...day, harnesses: { claude: { usd: day.usd, tokens: day.tokens } } })),
	totals: {
		usd: 35,
		tokens: 448000,
		uncachedInput: 60000,
		cachedInput: 330000,
		cacheWrite: 10000,
		output: 48000,
		reasoningOutput: 8000,
		cacheSavingsUsd: 82,
		trellisUsd: 35,
		sessions: 1,
		runs: 1,
		tickets: 1,
		approximate: false,
	},
	rankings: { usd: { groups, sessions: usageSessions }, tokens: { groups, sessions: usageSessions } },
	scannedFiles: 7,
	pricingTableUpdated: "2026-09-30",
	computedAt: timestamp,
};

const reportForDays = (count: UsageDays): UsageReport => {
	const values = usageDays(count);
	const rangeGroups = groupsForDays(values);
	return {
		...usageReport,
		days: count,
		buckets: values.map((day) => ({ ...day, harnesses: { claude: { usd: day.usd, tokens: day.tokens } } })),
		rankings: {
			usd: { groups: rangeGroups, sessions: usageSessions },
			tokens: { groups: rangeGroups, sessions: usageSessions },
		},
	};
};

const mergedWorkForDays = (count: UsageDays): UsageMergedWork => ({
	computedAt: timestamp,
	buckets: usageDays(count).map((day) => {
		const prs = day.usd === 0 ? 0 : day.usd - 1;
		return {
			day: day.day,
			prs,
			additions: prs * 100,
			deletions: prs * 40,
			missingAdditions: 0,
			missingDeletions: 0,
		};
	}),
	totals: { prs: 28, additions: 2800, deletions: 1120, missingAdditions: 0, missingDeletions: 0 },
});

export const usageMergedWork = mergedWorkForDays(30);
export const usageReport90 = reportForDays(90);
export const usageMergedWork90 = mergedWorkForDays(90);

const emptyGroups: Record<UsageGroupBy, UsageGroupRow[]> = {
	ticket: [],
	agent: [],
	project: [],
	kind: [],
	account: [],
	model: [],
	harness: [],
};

export const emptyUsageReport: UsageReport = {
	...usageReport,
	buckets: [],
	totals: {
		usd: 0,
		tokens: 0,
		uncachedInput: 0,
		cachedInput: 0,
		cacheWrite: 0,
		output: 0,
		reasoningOutput: 0,
		cacheSavingsUsd: 0,
		trellisUsd: 0,
		sessions: 0,
		runs: 0,
		tickets: 0,
		approximate: false,
	},
	rankings: {
		usd: { groups: emptyGroups, sessions: [] },
		tokens: { groups: emptyGroups, sessions: [] },
	},
	scannedFiles: 0,
};

export const emptyUsageRanking: UsageRanking = {
	groups: [],
	sessions: [],
	selected: null,
	groupTotal: 0,
	sessionTotal: 0,
	groupStart: 0,
	sessionStart: 0,
	maxValue: 0,
	selectedRank: null,
};

export const usageAccounts: UsageAccount[] = [
	{
		key: "claude/default",
		id: null,
		name: "Default Claude",
		harness: "claude",
		profilePath: "/workspace/storybook/claude",
		isDefault: true,
		defaultSource: "system",
		loginCommand: null,
		sharedWith: [],
		quota: {
			status: "ok",
			email: "reviewer@example.com",
			plan: "Synthetic account",
			detail: null,
			windows: [{ id: "five-hour", label: "Five hours", usedPercent: 42, resetsAt: "2026-09-30T17:00:00.000Z" }],
			creditsBalance: null,
			extraUsage: null,
			fetchedAt: timestamp,
		},
	},
];

export const systemUsage: SystemUsage = {
	sampledAt: timestamp,
	hostname: "storybook-host",
	platform: "darwin",
	cpuModel: "Synthetic processor",
	cpuCount: 12,
	cpuPercent: 38,
	memoryPercent: 62,
	memoryLevel: 1,
	memoryUsedBytes: 21303037788,
	memoryTotalBytes: 34359738368,
	loadAverage: [2.4, 2.1, 1.8],
	uptimeSeconds: 187200,
	history: Array.from({ length: 16 }, (_, index) => ({
		at: `2026-09-30T11:${String(44 + index).padStart(2, "0")}:00.000Z`,
		cpuPercent: 15 + index * 2,
		memoryPercent: 55 + index / 2,
		memoryLevel: 1,
	})),
};

export const usageResponses = {
	...projectResponses,
	"usage.report": (input: UsageReportInput) => reportForDays(input.days ?? 30),
	"usage.mergedWork": (input: UsageMergedWorkInput) => mergedWorkForDays(input.days),
	"usage.ranking": (input: UsageRankingInput) => {
		const values = usageDays(input.days);
		const rangeGroups = groupsForDays(values);
		return {
			groups: rangeGroups[input.group],
			sessions: usageSessions,
			selected: input.row ? groupRow(input.group, values) : null,
			groupTotal: 1,
			sessionTotal: 1,
			groupStart: 0,
			sessionStart: 0,
			maxValue: input.metric === "usd" ? 35 : 448000,
			selectedRank: input.row ? 0 : null,
		};
	},
	"usage.accounts": usageAccounts,
	"providers.list": [],
	"system.usage": systemUsage,
};
