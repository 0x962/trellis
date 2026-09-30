import type {
	SystemProcesses,
	SystemUsage,
	UsageAccount,
	UsageGroupBy,
	UsageGroupRow,
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

export const systemProcesses: SystemProcesses = {
	sampledAt: timestamp,
	processCount: 142,
	processes: [
		{
			pid: 421,
			parentPid: 1,
			user: "storybook",
			cpuPercent: 22,
			memoryBytes: 734003200,
			memoryPercent: 2.1,
			elapsedSeconds: 3600,
			state: "S",
			command: "trellis-host",
		},
		{
			pid: 422,
			parentPid: 421,
			user: "storybook",
			cpuPercent: 8,
			memoryBytes: 419430400,
			memoryPercent: 1.2,
			elapsedSeconds: 1800,
			state: "S",
			command: "agent-runtime",
		},
	],
};

export const usageResponses = {
	...projectResponses,
	"usage.report": usageReport,
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
	"system.processes": systemProcesses,
};
