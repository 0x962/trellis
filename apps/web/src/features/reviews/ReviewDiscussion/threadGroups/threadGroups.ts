import type { ReviewThread } from "@trellis/api";

export type ThreadGroups = {
	// The threads nobody resolved. They draw in full, and they are the work
	// the reader has left.
	open: ReviewThread[];
	// The threads somebody resolved. Each one draws as one line that opens on
	// a click, so the page builds no message body until the reader asks.
	resolved: ReviewThread[];
};

export type ThreadQuery = {
	// "all", "open" or "resolved", from the status control.
	status: string;
	// What the reader typed in the find field.
	search: string;
};

// The threads of a pull request, split by status and narrowed by the find
// field. The search reads the path, the author and the first message.
export function threadGroups(threads: readonly ReviewThread[], { status, search }: ThreadQuery): ThreadGroups {
	const query = search.trim().toLowerCase();
	const matching = threads.filter(
		(thread) =>
			(status === "all" || status === thread.status) &&
			(query === "" || `${thread.path} ${thread.author} ${thread.body}`.toLowerCase().includes(query)),
	);
	return {
		open: matching.filter((thread) => thread.status === "open"),
		resolved: matching.filter((thread) => thread.status !== "open"),
	};
}
