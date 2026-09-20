import { ConditionsBlock as ConditionsBlockView } from "@trellis/ui/review";
import { type Conditions, conditionLines, mergeReadiness } from "./conditionLines/conditionLines";

// The nine merge conditions of a pull request. The caller builds the
// `Conditions` object from the pull request row of the ticket, the test and
// evidence counts, the live branch state and the tickets that this ticket
// waits on.
export function ConditionsBlock({ conditions }: { conditions: Conditions }) {
	return <ConditionsBlockView readiness={mergeReadiness(conditions)} lines={conditionLines(conditions)} />;
}
