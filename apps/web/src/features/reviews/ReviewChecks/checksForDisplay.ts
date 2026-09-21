import type { Check } from "@trellis/api";
import type { ChecksLineCheck } from "@trellis/ui/review";

// `TicketPr.fail` includes the `cancel` bucket because both outcomes block a
// merge. `ChecksLine` uses the same bucket, so both summaries show one count.
export const checksForDisplay = (checks: readonly Check[]): ChecksLineCheck[] =>
	checks.map((check, index) => ({
		...check,
		key: `${check.workflow ?? ""}:${check.name}:${index}`,
		bucket: check.bucket === "cancel" ? "fail" : check.bucket,
	}));
