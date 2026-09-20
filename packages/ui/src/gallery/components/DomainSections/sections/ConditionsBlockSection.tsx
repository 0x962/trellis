import { type ConditionLine, ConditionsBlock } from "../../../../review";
import { Section } from "../../Section";

// Pull request 57080 of the canary repository: the checks still run, two
// threads stay open, the evidence floor gave no answer, and the ticket waits
// on one ticket.
const openPr: ConditionLine[] = [
	{ label: "size", value: "+312 −38 in 9 files · medium" },
	{ label: "risk", value: "auth yes · migration no · dependency no · shared type yes · deleted test no" },
	{ label: "tests", value: "none registered" },
	{ label: "evidence", value: "none registered" },
	{ label: "checks", value: "47 pass · 1 fail · 7 pending · 44 skipped" },
	{ label: "threads", value: "2 open" },
	{ label: "flows", value: "1 running · 1 passed" },
	{ label: "base", value: "update available" },
	{ label: "ancestors", value: "TRL-167 open" },
];

// The same pull request with every condition answered.
const clearPr: ConditionLine[] = [
	{ label: "size", value: "+312 −38 in 9 files · medium" },
	{ label: "risk", value: "auth no · migration no · dependency no · shared type no · deleted test no" },
	{ label: "tests", value: "3 registered" },
	{ label: "evidence", value: "2 registered" },
	{ label: "checks", value: "55 pass · 0 fail · 0 pending · 44 skipped" },
	{ label: "threads", value: "none open" },
	{ label: "flows", value: "2 passed" },
	{ label: "base", value: "ready" },
	{ label: "ancestors", value: "TRL-167 merged" },
];

// Pull request 56930 of the canary repository, after the merge.
const mergedPr: ConditionLine[] = [
	{ label: "size", value: "+94 −12 in 6 files · small" },
	{ label: "risk", value: "auth no · migration yes · dependency no · shared type no · deleted test no" },
	{ label: "tests", value: "4 registered" },
	{ label: "evidence", value: "3 registered" },
	{ label: "checks", value: "52 pass · 0 fail · 0 pending · 40 skipped" },
	{ label: "threads", value: "none open" },
	{ label: "flows", value: "3 passed" },
	{ label: "base", value: "not deployed" },
	{ label: "ancestors", value: "none" },
];

// A pull request whose facts have not arrived. Each line prints the words of
// its own empty answer.
const noAnswer: ConditionLine[] = [
	{ label: "size", value: "unknown" },
	{ label: "risk", value: "auth no · migration no · dependency no · shared type no · deleted test no" },
	{ label: "tests", value: "none registered" },
	{ label: "evidence", value: "none registered" },
	{ label: "checks", value: "0 pass · 0 fail · 0 pending · 0 skipped" },
	{ label: "threads", value: "none open" },
	{ label: "flows", value: "none run" },
	{ label: "base", value: "unknown" },
	{ label: "ancestors", value: "none" },
];

export function ConditionsBlockSection() {
	return (
		<Section
			name="ConditionsBlock"
			note="nine lines in one order; not yet, yes, merged, and no answer yet"
			className="items-start"
		>
			<div className="min-w-96 flex-1">
				<ConditionsBlock readiness="not yet" lines={openPr} />
			</div>
			<div className="min-w-96 flex-1">
				<ConditionsBlock readiness="yes" lines={clearPr} />
			</div>
			<div className="min-w-96 flex-1">
				<ConditionsBlock readiness="merged" lines={mergedPr} />
			</div>
			<div className="min-w-96 flex-1">
				<ConditionsBlock readiness="not yet" lines={noAnswer} />
			</div>
		</Section>
	);
}
