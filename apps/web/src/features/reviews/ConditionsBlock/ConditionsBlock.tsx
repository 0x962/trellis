import { ConditionsBlock as ConditionsBlockView } from "@trellis/ui/review";
import { type ConditionLabel, type Conditions, conditionLines, mergeReadiness } from "../conditionLines/conditionLines";

// The conditions the Overview tab prints. The size, the risk answers, the
// test proofs and the flow runs stay out: the person reads the size in the
// header, the flow runs in the Flows tab, and the other two in the evidence.
const shownLabels: readonly ConditionLabel[] = [
	"evidence",
	"checks",
	"comments",
	"base branch",
	"stacked on",
	"waits on",
];

// The merge conditions of a pull request, under the explanation of the
// change. `mergeReadiness` reads every condition, including the ones this
// block leaves out, so the word after `Ready to merge` still answers for the
// whole pull request.
export function ConditionsBlock({ conditions }: { conditions: Conditions }) {
	const lines = conditionLines(conditions).filter((line) => shownLabels.includes(line.label));
	return <ConditionsBlockView readiness={mergeReadiness(conditions)} lines={lines} />;
}
