import type { UsageRanking, UsageRankingInput, UsageReport } from "@trellis/api";
import { dayKey } from "../aggregate.ts";

export function rankingPage(report: UsageReport, input: UsageRankingInput): UsageRanking {
	const ranking = report.rankings[input.metric];
	const rows = ranking.groups[input.group];
	const selected = rows.find((row) => row.key === input.row) ?? null;
	const sessions = ranking.sessions.filter(
		(session) =>
			(input.row === undefined || session.groupKeys[input.group] === input.row) &&
			(input.day === undefined ||
				(dayKey(Date.parse(session.firstAt)) <= input.day && input.day <= dayKey(Date.parse(session.lastAt)))),
	);
	const groupStart = Math.min(input.groupPage, Math.max(0, Math.ceil(rows.length / 8) - 1)) * 8;
	const sessionStart = Math.min(input.sessionPage, Math.max(0, Math.ceil(sessions.length / 10) - 1)) * 10;
	return {
		groups: rows.slice(groupStart, groupStart + 8),
		sessions: sessions.slice(sessionStart, sessionStart + 10),
		selected,
		groupTotal: rows.length,
		sessionTotal: sessions.length,
		groupStart,
		sessionStart,
		maxValue: rows[0]?.[input.metric] ?? 0,
		selectedRank: selected === null ? null : rows.indexOf(selected),
	};
}
