import { ConditionsBlock as ConditionsBlockView } from "@trellis/ui/review";
import { type ConditionLabel, type Conditions, conditionLines } from "../../conditionLines/conditionLines";

// The four lines that the ticket page has room for.
const shortLabels: readonly ConditionLabel[] = ["evidence", "checks", "threads", "ancestors"];

// The short form of the conditions block. It reads the same words as the
// nine-line form, so one condition never prints two answers. It prints no
// readiness word: the ticket page reads the pull request row, which holds no
// test proof, so the word could read `not yet` for a pull request that is
// ready.
export function ShortConditions({ conditions }: { conditions: Conditions }) {
	const lines = conditionLines(conditions).filter((line) => shortLabels.includes(line.label));
	return <ConditionsBlockView lines={lines} level={3} />;
}
