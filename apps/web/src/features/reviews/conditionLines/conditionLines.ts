import { type EvidenceFloorItem, type PrKind, type PrPathFacts, proofSentence, type TicketPr } from "@trellis/api";
import type { ConditionLine, ConditionsReadiness } from "@trellis/ui/review";

// One ticket that this ticket waits on, and the state of the pull request of
// that ticket.
export type ConditionsAncestor = {
	// The ticket identifier, such as "TRL-164".
	identifier: string;
	merged: boolean;
};

// What the change owes as evidence, and what of it is already there. The
// floor of a frontend change and the floor of a backend change ask for
// different items, so the line names the kind that built the count.
export type EvidenceCondition = {
	present: number;
	required: number;
	missing: readonly EvidenceFloorItem[];
	kind: PrKind;
};

// What one flow run of the ticket ended as. A run that waits has not started
// and a run that runs has not finished, so both read as running.
export type FlowWord = "running" | "passed" | "failed" | "canceled";

// How far the pull request head sits behind its base branch, from the compare
// call that fetched the revision on screen.
export type BaseCondition = {
	// How many commits the base branch holds that the head does not. Null
	// means the page knows the branch name but not the distance.
	behindBy: number | null;
	// The name of the base branch, such as "master".
	baseRefName: string;
};

// The flow runs of the ticket that owns the pull request.
export type FlowsCondition = {
	// How many runs the ticket has.
	total: number;
	// The newest run. `findings` counts the review comments that its agents wrote.
	newest: { name: string; status: FlowWord; findings: number } | null;
	// These counts stop a merge across the five newest runs. A waiting run
	// counts as running.
	running: number;
	failed: number;
};

// The test proofs of the pull request. One proof names a test, the commit
// where that test fails and the commit where it passes.
export type TestsCondition = {
	// How many records name a test.
	count: number;
	// The commit where every named test fails, and the commit where every
	// named test passes. Both are null when the records name more than one
	// pair of commits.
	failsOn: string | null;
	passesOn: string | null;
	// True when a record says that no test applies to this change.
	noneApplies: boolean;
};

export type Conditions = {
	// True when GitHub merged the pull request.
	merged: boolean;
	size: { additions: number; deletions: number; changedFiles: number } | null;
	sizeBand: TicketPr["sizeBand"];
	risk: PrPathFacts["risk"];
	// The test proofs of this pull request. `null` means that no record
	// arrived.
	tests: TestsCondition | null;
	// The evidence floor of this pull request. `null` means that nobody could
	// build the floor, because the changed file list has not arrived.
	evidence: EvidenceCondition | null;
	checks: { pass: number; fail: number; pending: number; skipped: number };
	// The number of review comments that nobody resolved.
	threads: number;
	flows: FlowsCondition;
	base: BaseCondition;
	stackedOn: { number: number; ticketIdentifier: string } | null;
	ancestors: readonly ConditionsAncestor[];
};

// The condition labels, in the order they print.
export const conditionLabels = [
	"size",
	"risk",
	"tests",
	"evidence",
	"checks",
	"comments",
	"flows",
	"base branch",
	"stacked on",
	"waits on",
] as const;

export type ConditionLabel = (typeof conditionLabels)[number];

const riskWords: ReadonlyArray<[keyof PrPathFacts["risk"], string]> = [
	["api", "api"],
	["cli", "cli"],
	["background", "background job"],
	["auth", "auth"],
	["migration", "migration"],
	["dependency", "dependency"],
	["sharedType", "shared type"],
	["deletedTest", "deleted test"],
];

const fileWords = (count: number) => (count === 1 ? "1 file" : `${count} files`);

const sizeValue = ({ size, sizeBand }: Conditions) => {
	if (!size) return "unknown";
	const lines = `+${size.additions} −${size.deletions} · ${fileWords(size.changedFiles)}`;
	return sizeBand ? `${lines} · band ${sizeBand}` : lines;
};

// An all clear reads as five "no" answers, never a green mark.
const riskValue = (risk: PrPathFacts["risk"]) => riskWords.map(([key, word]) => `${word} ${risk[key]}`).join(" · ");

// GitHub prints 7 characters of a commit.
const shortSha = (sha: string) => sha.slice(0, 7);

// One test reads "it fails", two read "both fail", more read "all fail".
const testWords = (count: number) =>
	count === 1
		? { subject: "it", fails: "fails", passes: "passes" }
		: { subject: count === 2 ? "both" : "all", fails: "fail", passes: "pass" };

const testsValue = (tests: Conditions["tests"]) => {
	if (tests === null) return "unknown";
	if (tests.count === 0) return tests.noneApplies ? "no test applies" : "none registered";
	if (tests.failsOn === null || tests.passesOn === null) return `${tests.count} new`;
	const words = testWords(tests.count);
	return [
		`${tests.count} new`,
		`${words.subject} ${words.fails} on base ${shortSha(tests.failsOn)}`,
		`${words.subject} ${words.passes} on head ${shortSha(tests.passesOn)}`,
	].join(" · ");
};

const kindWords: Record<PrKind, string> = {
	frontend: "a frontend change",
	backend: "a backend change",
	mixed: "a mixed change",
	docs: "a docs change",
};

const evidenceValue = (evidence: Conditions["evidence"]) =>
	evidence === null
		? "unknown"
		: `${proofSentence(evidence.missing, evidence.present, evidence.required)} for ${kindWords[evidence.kind]}`;

// The failure first, then what still runs, then what finished. An outcome
// that counts zero prints no words, the same as the pull request row of the
// epic page.
const checkOutcomes: ReadonlyArray<[keyof Conditions["checks"], string]> = [
	["fail", "failed"],
	["pending", "pending"],
	["pass", "passed"],
	["skipped", "skipped"],
];

const checksValue = (checks: Conditions["checks"]) => {
	const facts = checkOutcomes.filter(([key]) => checks[key] > 0).map(([key, word]) => `${checks[key]} ${word}`);
	return facts.length === 0 ? "none reported" : facts.join(" · ");
};

const threadsValue = (threads: number) => {
	if (threads === 0) return "none open";
	return threads === 1 ? "1 open" : `${threads} open`;
};

const countPhrase = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

const flowsValue = ({ total, newest }: Conditions["flows"]) => {
	if (total === 0 || newest === null) return "none run";
	return `${newest.name} ${newest.status} · ${countPhrase(newest.findings, "comment", "comments")}`;
};

const baseValue = (base: Conditions["base"]) => {
	if (base.behindBy === null || base.behindBy === 0) return base.baseRefName;
	return `${base.baseRefName} · ${base.behindBy} ${base.behindBy === 1 ? "commit" : "commits"} behind`;
};

const ancestorsValue = (ancestors: Conditions["ancestors"]) => {
	return ancestors.map((ancestor) => `${ancestor.identifier} ${ancestor.merged ? "merged" : "open"}`).join(" · ");
};

const stackedOnValue = (stackedOn: NonNullable<Conditions["stackedOn"]>) =>
	`#${stackedOn.number} · ${stackedOn.ticketIdentifier}`;

// Each condition that stops a merge, as one short phrase, such as
// "1 check failed" or "1 of 4 evidence". The size, the risk answers and the
// base state describe the change. They stop no merge, so they stay out of
// this list.
export function unmetConditions(conditions: Conditions): string[] {
	const { checks, tests, evidence, flows } = conditions;
	return [
		checks.fail > 0 && countPhrase(checks.fail, "check failed", "checks failed"),
		checks.pending > 0 && countPhrase(checks.pending, "check pending", "checks pending"),
		conditions.threads > 0 && countPhrase(conditions.threads, "comment open", "comments open"),
		tests === null && "tests unknown",
		tests !== null && tests.count === 0 && !tests.noneApplies && "no test registered",
		evidence === null && "evidence unknown",
		evidence !== null && evidence.present < evidence.required && `${evidence.present} of ${evidence.required} evidence`,
		flows.running > 0 && countPhrase(flows.running, "flow running", "flows running"),
		flows.failed > 0 && countPhrase(flows.failed, "flow failed", "flows failed"),
		...conditions.ancestors.map((ancestor) => !ancestor.merged && `${ancestor.identifier} not merged`),
	].filter((phrase): phrase is string => phrase !== false);
}

// The word after "READY TO MERGE".
export function mergeReadiness(conditions: Conditions): ConditionsReadiness {
	if (conditions.merged) return "merged";
	return unmetConditions(conditions).length > 0 ? "not yet" : "yes";
}

export function conditionLines(conditions: Conditions): Array<ConditionLine & { label: ConditionLabel }> {
	return [
		{ label: "size", value: sizeValue(conditions) },
		{ label: "risk", value: riskValue(conditions.risk) },
		{ label: "tests", value: testsValue(conditions.tests) },
		{ label: "evidence", value: evidenceValue(conditions.evidence) },
		{ label: "checks", value: checksValue(conditions.checks) },
		{ label: "comments", value: threadsValue(conditions.threads) },
		{ label: "flows", value: flowsValue(conditions.flows) },
		{ label: "base branch", value: baseValue(conditions.base) },
		conditions.stackedOn === null ? null : { label: "stacked on", value: stackedOnValue(conditions.stackedOn) },
		conditions.ancestors.length === 0 ? null : { label: "waits on", value: ancestorsValue(conditions.ancestors) },
	].filter((line): line is ConditionLine & { label: ConditionLabel } => line !== null);
}
