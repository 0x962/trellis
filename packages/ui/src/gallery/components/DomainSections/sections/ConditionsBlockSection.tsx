import { type ConditionLine, ConditionsBlock } from "../../../../review";
import { Section } from "../../Section";

// Pull request 57080 of the canary repository, before the merge.
const openPr: ConditionLine[] = [
	{ label: "size", value: "+312 −38 in 9 files · medium" },
	{ label: "risk", value: "auth yes · migration no · dependency no · shared type yes · deleted test no" },
	{ label: "tests", value: "none registered" },
	{ label: "evidence", value: "1 of 4 for a backend change" },
	{ label: "checks", value: "1 failed · 7 pending · 47 passed · 44 skipped" },
	{ label: "threads", value: "2 open" },
	{ label: "flows", value: "1 running · 1 passed" },
	{ label: "base", value: "update available" },
	{ label: "ancestors", value: "TRL-167 open" },
];

// The same pull request with every condition answered.
const answeredPr: ConditionLine[] = [
	{ label: "size", value: "+312 −38 in 9 files · medium" },
	{ label: "risk", value: "auth no · migration no · dependency no · shared type no · deleted test no" },
	{ label: "tests", value: "3 new · all fail on base 4c9a771 · all pass on head 8b21f0c" },
	{ label: "evidence", value: "4 of 4 for a backend change" },
	{ label: "checks", value: "55 passed · 44 skipped" },
	{ label: "threads", value: "none open" },
	{ label: "flows", value: "2 passed" },
	{ label: "base", value: "ready" },
	{ label: "ancestors", value: "TRL-167 merged" },
];

// Pull request 56930 of the canary repository, after the merge.
const mergedPr: ConditionLine[] = [
	{ label: "size", value: "+94 −12 in 6 files · small" },
	{ label: "risk", value: "auth no · migration yes · dependency no · shared type no · deleted test no" },
	{ label: "tests", value: "2 new · both fail on base 19cea5c · both pass on head cede34b" },
	{ label: "evidence", value: "5 of 5 for a frontend change" },
	{ label: "checks", value: "52 passed · 40 skipped" },
	{ label: "threads", value: "none open" },
	{ label: "flows", value: "3 passed" },
	{ label: "base", value: "not deployed" },
	{ label: "ancestors", value: "none" },
];

// A pull request whose facts have not arrived.
const unknownPr: ConditionLine[] = [
	{ label: "size", value: "unknown" },
	{ label: "risk", value: "auth no · migration no · dependency no · shared type no · deleted test no" },
	{ label: "tests", value: "unknown" },
	{ label: "evidence", value: "unknown" },
	{ label: "checks", value: "none reported" },
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
				<ConditionsBlock readiness="yes" lines={answeredPr} />
			</div>
			<div className="min-w-96 flex-1">
				<ConditionsBlock readiness="merged" lines={mergedPr} />
			</div>
			<div className="min-w-96 flex-1">
				<ConditionsBlock readiness="not yet" lines={unknownPr} />
			</div>
		</Section>
	);
}
