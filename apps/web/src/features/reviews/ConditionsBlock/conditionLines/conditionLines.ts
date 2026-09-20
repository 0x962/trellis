import type { PrPathFacts, TicketPr } from "@trellis/api";
import type { ConditionLine, ConditionsReadiness } from "@trellis/ui/review";
import type { LiveBranchState } from "../../ReviewLive/liveBranch";

// One ticket that this ticket waits on, and the state of the pull request of
// that ticket.
export type ConditionsAncestor = {
	// The ticket identifier, such as "TRL-164".
	identifier: string;
	merged: boolean;
};

export type Conditions = {
	// True when GitHub merged the pull request.
	merged: boolean;
	size: { additions: number; deletions: number; changedFiles: number } | null;
	sizeBand: TicketPr["sizeBand"];
	risk: PrPathFacts["risk"];
	// The number of test proofs that the evidence floor received. `null` means
	// that the floor gave no answer.
	tests: number | null;
	// The number of evidence records that the evidence floor received. `null`
	// means that the floor gave no answer.
	evidence: number | null;
	checks: { pass: number; fail: number; pending: number; skipped: number };
	// The number of review threads that nobody resolved.
	threads: number;
	flows: { running: number; passed: number; failed: number };
	base: LiveBranchState | null;
	ancestors: readonly ConditionsAncestor[];
};

// The nine conditions, in the order they print.
export const conditionLabels = [
	"size",
	"risk",
	"tests",
	"evidence",
	"checks",
	"threads",
	"flows",
	"base",
	"ancestors",
] as const;

export type ConditionLabel = (typeof conditionLabels)[number];

const riskWords: ReadonlyArray<[keyof PrPathFacts["risk"], string]> = [
	["auth", "auth"],
	["migration", "migration"],
	["dependency", "dependency"],
	["sharedType", "shared type"],
	["deletedTest", "deleted test"],
];

const fileWords = (count: number) => (count === 1 ? "1 file" : `${count} files`);

const sizeValue = ({ size, sizeBand }: Conditions) => {
	if (!size) return "unknown";
	const lines = `+${size.additions} −${size.deletions} in ${fileWords(size.changedFiles)}`;
	return sizeBand ? `${lines} · ${sizeBand}` : lines;
};

// Every risk class prints its own answer. An all clear reads as five "no"
// answers.
const riskValue = (risk: PrPathFacts["risk"]) => riskWords.map(([key, word]) => `${word} ${risk[key]}`).join(" · ");

// A floor that gave no answer, and a floor that received nothing, read the
// same. Neither prints a zero.
const floorValue = (count: number | null) =>
	count === null || count === 0 ? "none registered" : `${count} registered`;

const checksValue = ({ pass, fail, pending, skipped }: Conditions["checks"]) =>
	`${pass} pass · ${fail} fail · ${pending} pending · ${skipped} skipped`;

const threadsValue = (threads: number) => {
	if (threads === 0) return "none open";
	return threads === 1 ? "1 open" : `${threads} open`;
};

const flowsValue = ({ running, passed, failed }: Conditions["flows"]) => {
	const parts: string[] = [];
	if (running > 0) parts.push(`${running} running`);
	if (passed > 0) parts.push(`${passed} passed`);
	if (failed > 0) parts.push(`${failed} failed`);
	return parts.length === 0 ? "none run" : parts.join(" · ");
};

const baseValue = (base: LiveBranchState | null) => (base ? base.label.toLowerCase() : "unknown");

const ancestorsValue = (ancestors: Conditions["ancestors"]) => {
	if (ancestors.length === 0) return "none";
	return ancestors.map((ancestor) => `${ancestor.identifier} ${ancestor.merged ? "merged" : "open"}`).join(" · ");
};

// A condition that stops a merge. The size, the risk answers and the base
// state describe the change. They stop no merge, so they stay out of this
// list.
const blockers = (conditions: Conditions) => [
	conditions.checks.fail > 0,
	conditions.checks.pending > 0,
	conditions.threads > 0,
	conditions.tests === null,
	conditions.evidence === null,
	conditions.flows.running > 0,
	conditions.flows.failed > 0,
	conditions.ancestors.some((ancestor) => !ancestor.merged),
];

// The word after "READY TO MERGE". A merged pull request reads "merged". One
// open condition makes the word "not yet".
export function mergeReadiness(conditions: Conditions): ConditionsReadiness {
	if (conditions.merged) return "merged";
	return blockers(conditions).some(Boolean) ? "not yet" : "yes";
}

export function conditionLines(conditions: Conditions): Array<ConditionLine & { label: ConditionLabel }> {
	return [
		{ label: "size", value: sizeValue(conditions) },
		{ label: "risk", value: riskValue(conditions.risk) },
		{ label: "tests", value: floorValue(conditions.tests) },
		{ label: "evidence", value: floorValue(conditions.evidence) },
		{ label: "checks", value: checksValue(conditions.checks) },
		{ label: "threads", value: threadsValue(conditions.threads) },
		{ label: "flows", value: flowsValue(conditions.flows) },
		{ label: "base", value: baseValue(conditions.base) },
		{ label: "ancestors", value: ancestorsValue(conditions.ancestors) },
	];
}
