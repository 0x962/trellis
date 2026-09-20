import { ConditionsBlock as ConditionsBlockView } from "@trellis/ui/review";
import { type ConditionLabel, type Conditions, conditionLines, mergeReadiness } from "../conditionLines/conditionLines";

// The four conditions that stop a merge on their own. The ticket page has
// room for these lines only.
const shortLabels: readonly ConditionLabel[] = ["evidence", "checks", "threads", "ancestors"];

// The short form of the conditions block. It reads the same words as the
// nine-line form, so one condition never prints two answers.
export function ShortConditions({ conditions }: { conditions: Conditions }) {
	const lines = conditionLines(conditions).filter((line) => shortLabels.includes(line.label));
	return <ConditionsBlockView readiness={mergeReadiness(conditions)} lines={lines} />;
}
