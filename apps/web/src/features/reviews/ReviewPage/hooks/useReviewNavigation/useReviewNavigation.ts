import { useLocation } from "@tanstack/react-router";

// The hash of a review route carries one value, `thread`: the review comment
// that a deep link opens. A link written while the page still had a tab strip
// reads `#discussion?thread=<id>`, so the word before the query is dropped and
// only the query is read.
//
// `syncHash` is false while the page sits in a `PageSheet` over another page.
// The hash then belongs to the page under the sheet.
export const useReviewNavigation = (syncHash: boolean) => {
	const hash = useLocation({ select: (location) => location.hash });
	const activeThread = syncHash ? new URLSearchParams(hash.split("?")[1]).get("thread") : null;
	return { activeThread };
};
