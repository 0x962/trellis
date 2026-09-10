import type { PrState } from "@trellis/api";

export type PrStateIconProps = {
	state: PrState;
	isDraft: boolean;
};

// The state of one pull request as an icon and a text label. Color is never
// the only signal, so every state names itself for a screen reader.
export function PrStateIcon(_props: PrStateIconProps) {
	return null;
}
