import { ConditionsBlock as ConditionsBlockView } from "@trellis/ui/review";
import { type ConditionLabel, type Conditions, conditionLines, mergeReadiness } from "../conditionLines/conditionLines";

// The four lines that the ticket page has room for. `tests` and `flows` also
// change the readiness word, so the short form can read "not yet" with no line
// that names the reason.
const shortLabels: readonly ConditionLabel[] = ["evidence", "checks", "threads", "ancestors"];

// The short form of the conditions block. It reads the same words as the
// nine-line form, so one condition never prints two answers.
export function ShortConditions({ conditions }: { conditions: Conditions }) {
	const lines = conditionLines(conditions).filter((line) => shortLabels.includes(line.label));
	return <ConditionsBlockView readiness={mergeReadiness(conditions)} lines={lines} />;
}
