import type {
	MemoryPressureLevel,
	SystemUsage,
	UsageAccount,
	UsageGroupBy,
	UsageGroupRow,
	UsageRanking,
	UsageRankingInput,
	UsageReport,
	UsageSession,
} from "@trellis/api";
import { id, timestamp } from "./project";
import { projectResponses } from "./responses";

const days = Array.from({ length: 7 }, (_, index) => ({
	day: `2026-09-${24 + index}`,
	usd: 2 + index,
	tokens: (index + 1) * 16000,
}));
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

const groupRow = (group: UsageGroupBy): UsageGroupRow => ({
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
	days,
});
const groups = {
	ticket: [groupRow("ticket")],
	agent: [groupRow("agent")],
	project: [groupRow("project")],
	kind: [groupRow("kind")],
	account: [groupRow("account")],
	model: [groupRow("model")],
	harness: [groupRow("harness")],
};

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

const memoryTotalBytes = 32 * 1024 ** 3;

export const systemUsage: SystemUsage = {
	sampledAt: timestamp,
	hostname: "storybook-host",
	platform: "darwin",
	cpuModel: "Synthetic processor",
	cpuCount: 12,
	cpuPercent: 38,
	memoryPercent: 62,
	memoryLevel: 1,
	memoryUsedBytes: Math.round(memoryTotalBytes * 0.62),
	memoryTotalBytes,
	loadAverage: [2.4, 2.1, 1.8],
	uptimeSeconds: 187200,
	history: Array.from({ length: 16 }, (_, index) => ({
		at: new Date(Date.parse(timestamp) - (15 - index) * 2_000).toISOString(),
		cpuPercent: 8 + index * 2,
		memoryPercent: 55 + (index / 15) * 7,
		memoryLevel: 1,
	})),
};

export const systemUsageWithMemory = (memoryPercent: number, memoryLevel: MemoryPressureLevel): SystemUsage => ({
	...systemUsage,
	memoryPercent,
	memoryLevel,
	memoryUsedBytes: Math.round((memoryTotalBytes * memoryPercent) / 100),
	history: systemUsage.history.map((sample) => ({ ...sample, memoryPercent, memoryLevel })),
});

export const systemUsageAt = (sampledAt: string): SystemUsage => {
	const history = Array.from({ length: 16 }, (_, index) => {
		const at = Date.parse(sampledAt) - (15 - index) * 2_000;
		return {
			at: new Date(at).toISOString(),
			cpuPercent: 50 + Math.sin(at / 2_000) * 25,
			memoryPercent: 62 + Math.cos(at / 2_000) * 3,
			memoryLevel: 1,
		};
	});
	const latest = history.at(-1)!;
	return {
		...systemUsageWithMemory(latest.memoryPercent, latest.memoryLevel),
		sampledAt,
		cpuPercent: latest.cpuPercent,
		history,
	};
};

export const usageResponses = {
	...projectResponses,
	"usage.report": usageReport,
	"usage.mergedWork": {
		computedAt: timestamp,
		buckets: days.map((day, index) => ({
			day: day.day,
			prs: index + 1,
			additions: (index + 1) * 100,
			deletions: (index + 1) * 40,
			missingAdditions: 0,
			missingDeletions: 0,
		})),
		totals: { prs: 28, additions: 2800, deletions: 1120, missingAdditions: 0, missingDeletions: 0 },
	},
	"usage.ranking": (input: UsageRankingInput) => ({
		groups: groups[input.group],
		sessions: usageSessions,
		selected: input.row ? groupRow(input.group) : null,
		groupTotal: 1,
		sessionTotal: 1,
		groupStart: 0,
		sessionStart: 0,
		maxValue: input.metric === "usd" ? 35 : 448000,
		selectedRank: input.row ? 0 : null,
	}),
	"usage.accounts": usageAccounts,
	"providers.list": [],
	"system.usage": systemUsage,
	"system.pressure": {
		sampledAt: timestamp,
		hostname: systemUsage.hostname,
		platform: systemUsage.platform,
		cpuCount: systemUsage.cpuCount,
		loadAverage1m: systemUsage.loadAverage[0],
		loadPerCore: systemUsage.loadAverage[0] / systemUsage.cpuCount,
		memoryLevel: 1,
		processorTemperature: { state: "unavailable" as const, reason: "reader-not-installed" as const, readDurationMs: 0 },
		disk: { state: "failed" as const, path: "/workspace/storybook" },
		runs: [
			{ id: id(410), name: "Review the interface", ticketIdentifier: "DEMO-40", memoryBytes: 2 * 1024 ** 3 },
			{ id: id(411), name: "Review the interface again", ticketIdentifier: "DEMO-40", memoryBytes: 512 * 1024 ** 2 },
			{ id: id(412), name: "Synthetic standalone session", ticketIdentifier: null, memoryBytes: 256 * 1024 ** 2 },
		],
	},
};
