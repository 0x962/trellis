import type { PrState } from "@trellis/api";
import { PrGlyph } from "@trellis/ui";

export type PrStateIconProps = {
	state: PrState;
	isDraft: boolean;
};

// The state of one pull request in the pull request list. The shape and the
// color come from GitHub, and the sr-only text of PrGlyph names the state, so
// color is never the only signal.
export function PrStateIcon({ state, isDraft }: PrStateIconProps) {
	return <PrGlyph state={state} isDraft={isDraft} />;
}
