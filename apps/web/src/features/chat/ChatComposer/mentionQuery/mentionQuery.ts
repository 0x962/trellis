// One agent, person, or role the composer can complete. `insert` is what
// replaces the typed `@query`.
export type MentionCandidate = { id: string; label: string; insert: string; hint?: string };

// The `@query` the caret sits in, or null. The token starts at a line start
// or after a space, holds no space, and ends at the caret.
export const mentionQuery = (text: string, caret: number): { start: number; query: string } | null => {
	const before = text.slice(0, caret);
	const match = /(?:^|\s)@([^\s@]*)$/.exec(before);
	if (match === null) return null;
	return { start: caret - match[1]!.length - 1, query: match[1]! };
};

// The candidates for a query, in the given order: a label that starts with
// the query first, then a label that holds it. The query ignores case.
export const matchCandidates = (candidates: readonly MentionCandidate[], query: string) => {
	const needle = query.toLowerCase();
	const starts = candidates.filter((candidate) => candidate.label.toLowerCase().startsWith(needle));
	const holds = candidates.filter(
		(candidate) => !starts.includes(candidate) && candidate.label.toLowerCase().includes(needle),
	);
	return [...starts, ...holds];
};

// The text with the `@query` at `start..caret` replaced by the mention and
// one space, and the caret after that space.
export const completeMention = (text: string, start: number, caret: number, insert: string) => {
	const next = `${text.slice(0, start)}${insert} ${text.slice(caret)}`;
	return { text: next, caret: start + insert.length + 1 };
};

// The roles a mention can name instead of one agent.
export const roleCandidates: readonly MentionCandidate[] = [
	{ id: "role:manager", label: "manager", insert: "@manager", hint: "the manager of the tree" },
	{ id: "role:builders", label: "builders", insert: "@builders", hint: "every live builder" },
	{ id: "role:reviewers", label: "reviewers", insert: "@reviewers", hint: "every live reviewer" },
];

type LiveAgent = { id: string; personaName: string; kind: string };

// One candidate per live agent. A persona name that two live agents share
// inserts the run id, so the mention reaches one agent.
export const agentCandidates = (agents: readonly LiveAgent[]): MentionCandidate[] => {
	const count = new Map<string, number>();
	for (const agent of agents) count.set(agent.personaName, (count.get(agent.personaName) ?? 0) + 1);
	return agents.map((agent) => ({
		id: agent.id,
		label: agent.personaName,
		insert: `@${(count.get(agent.personaName) ?? 0) > 1 ? agent.id : agent.personaName}`,
		hint: `${agent.kind} ${agent.id}`,
	}));
};
