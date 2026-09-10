import type { Check } from "@trellis/api";

export type CheckCountPillProps = {
	checks: readonly Check[];
};

// The pass, fail, and pending counts of one pull request. The tone follows
// the worst bucket in the list.
export function CheckCountPill(_props: CheckCountPillProps) {
	return null;
}
