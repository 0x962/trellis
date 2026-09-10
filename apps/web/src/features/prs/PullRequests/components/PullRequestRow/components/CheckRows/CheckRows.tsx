import type { Check } from "@trellis/api";

export type CheckRowsProps = {
	checks: readonly Check[];
};

// One row per check under an expanded pull request, failing checks first.
export function CheckRows(_props: CheckRowsProps) {
	return null;
}
