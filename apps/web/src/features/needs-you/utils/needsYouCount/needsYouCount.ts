import type { Inbox } from "@trellis/api";

// How many rows Needs you holds. The sidebar badge shows this number, and
// the page header shows it beside the title.
export const needsYouCount = (_inbox: Inbox): number => {
	throw new Error("needsYouCount is not implemented.");
};
