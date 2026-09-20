import { useLocation } from "@tanstack/react-router";

// The hash of a review route carries one value, `thread`: the review comment
// that a deep link opens. A hash can also hold a word before the query, as in
// `#discussion?thread=<id>`. The code drops the text before `?` and reads the
// query only.
//
// `syncHash` is false while the page sits in a `PageSheet` over another page.
// The hash then belongs to the page under the sheet.
export const useActiveThread = (syncHash: boolean) => {
	const hash = useLocation({ select: (location) => location.hash });
	return syncHash ? new URLSearchParams(hash.split("?")[1]).get("thread") : null;
};
