import type { Check, TicketSummary } from "@trellis/api";
import type { ReactElement } from "react";

export type InboxRowProps = {
	ticket: TicketSummary;
	// The checks of the linked pull requests. A Failing CI row names the
	// failing ones on its meta line.
	checks?: readonly Check[];
	onPress?: () => void;
};

// One ticket in a Needs you section. Every row has the same height, so
// FlashList never measures.
export function InboxRow(_props: InboxRowProps): ReactElement {
	throw new Error("mobile-inbox: InboxRow is not implemented");
}
