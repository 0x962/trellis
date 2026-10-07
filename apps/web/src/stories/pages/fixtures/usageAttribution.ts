import { UsageGroupBySchema, type UsageGroupRow, type UsageRankingInput, type UsageReport } from "@trellis/api";
import { usageReport, usageSessions } from "./usage";

const sessions = Array.from({ length: 23 }, (_, index) => ({
	...usageSessions[0]!,
	sessionId: `usage-session-${index}`,
	label:
		index === 22
			? "Review the shared production interface across every project and provider account"
			: `Review session ${index + 1}`,
	usd: index,
	tokens: index * 1000,
	approximate: index === 1,
	groupKeys: { ...usageSessions[0]!.groupKeys, agent: `agent-${index}` },
}));
const groups = Object.fromEntries(
	UsageGroupBySchema.options.map((group) => {
		const rows = new Map<string, UsageGroupRow>();
		for (const session of sessions) {
			const key = session.groupKeys[group];
			const row = rows.get(key) ?? {
				...usageReport.rankings.usd.groups[group][0]!,
				key,
				label: key,
				usd: 0,
				tokens: 0,
				sessions: 0,
				approximate: false,
				days: [],
			};
			row.usd += session.usd;
			row.tokens += session.tokens;
			row.sessions += 1;
			row.approximate ||= session.approximate;
			row.days = [{ day: "2026-09-30", usd: row.usd, tokens: row.tokens }];
			rows.set(key, row);
		}
		return [group, [...rows.values()].sort((a, b) => b.usd - a.usd)];
	}),
) as UsageReport["rankings"]["usd"]["groups"];

export const attributionReport: UsageReport = {
	...usageReport,
	totals: {
		...usageReport.totals,
		usd: 253,
		tokens: 253000,
		sessions: 23,
		approximate: true,
		trellisUsd: 253,
		uncachedInput: 50000,
		cachedInput: 180000,
		cacheWrite: 3000,
		output: 20000,
		reasoningOutput: 5000,
		runs: 23,
	},
	buckets: [{ day: "2026-09-30", usd: 253, tokens: 253000, harnesses: { claude: { usd: 253, tokens: 253000 } } }],
	rankings: { usd: { groups, sessions }, tokens: { groups, sessions } },
};

export function attributionRanking(input: UsageRankingInput) {
	const rows = groups[input.group];
	const matching = sessions
		.filter(
			(session) =>
				(input.row === undefined || session.groupKeys[input.group] === input.row) &&
				(input.day === undefined || (input.day >= "2026-09-24" && input.day <= "2026-09-30")),
		)
		.sort((a, b) => b[input.metric] - a[input.metric]);
	const groupStart = Math.min(input.groupPage ?? 0, Math.max(0, Math.ceil(rows.length / 8) - 1)) * 8;
	const sessionStart = Math.min(input.sessionPage ?? 0, Math.max(0, Math.ceil(matching.length / 10) - 1)) * 10;
	return {
		groups: rows.slice(groupStart, groupStart + 8),
		sessions: matching.slice(sessionStart, sessionStart + 10),
		selected: rows.find((row) => row.key === input.row) ?? null,
		groupTotal: rows.length,
		sessionTotal: matching.length,
		groupStart,
		sessionStart,
		maxValue: rows[0]![input.metric],
		selectedRank: input.row ? rows.findIndex((row) => row.key === input.row) : null,
	};
}
