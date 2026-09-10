import type { ReactElement, ReactNode } from "react";

export type SwipeRowProps = {
	// The ticket identifier. The pan gesture carries the test id `swipe-<identifier>`.
	identifier: string;
	children: ReactNode;
	// A right swipe past the threshold. Absent on a row outside Review.
	onApprove?: () => void;
	// A left swipe past the threshold. Absent on a row outside Review.
	onSendBack?: () => void;
	// True once the row leaves the list. The row collapses and fades, then
	// calls `onRemoved`. Under reduce motion it calls `onRemoved` at once.
	removing?: boolean;
	onRemoved?: () => void;
};

export function SwipeRow(_props: SwipeRowProps): ReactElement {
	throw new Error("mobile-inbox: SwipeRow is not implemented");
}
